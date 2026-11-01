import { MealAnalysis, MealLog, PatternInsight, ReactionAnalysis, STORAGE_KEYS } from '../types';
import { Language } from '../i18n/translations';

function readLogs(): MealLog[] {
  const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
  return raw ? (JSON.parse(raw) as MealLog[]) : [];
}

function writeLogs(logs: MealLog[]) {
  localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
}

function patchLog(id: string, patch: Partial<MealLog>) {
  const logs = readLogs().map((l) => (l.id === id ? { ...l, ...patch } : l));
  writeLogs(logs);
}

/**
 * Fire-and-forget meal analysis. Marks the log `pending`, calls the API route,
 * then persists the returned analysis (or an `error` status) back to localStorage.
 * Returns the analysis on success so callers can also update in-memory state.
 */
export async function analyzeMealLog(
  log: MealLog,
  knownAllergies: string[],
  language: Language
): Promise<MealAnalysis | null> {
  patchLog(log.id, { analysisStatus: 'pending' });
  try {
    const res = await fetch('/api/analyze-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mealName: log.mealName,
        description: log.description,
        photoDataUrl: log.photoUrl,
        knownAllergies,
        language,
      }),
    });
    if (!res.ok) {
      patchLog(log.id, { analysisStatus: 'error' });
      return null;
    }
    const analysis = (await res.json()) as MealAnalysis;
    patchLog(log.id, { analysis, analysisStatus: 'done' });
    return analysis;
  } catch {
    patchLog(log.id, { analysisStatus: 'error' });
    return null;
  }
}

/**
 * Fire-and-forget reaction analysis — the reaction-specific counterpart to
 * analyzeMealLog. Reads symptoms/intensity/context and persists an assessment,
 * likely triggers, and an urgency flag.
 */
export async function analyzeReactionLog(
  log: MealLog,
  knownAllergies: string[],
  language: Language
): Promise<ReactionAnalysis | null> {
  patchLog(log.id, { reactionAnalysisStatus: 'pending' });
  try {
    const res = await fetch('/api/analyze-reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: log.mealName,
        symptoms: log.symptoms,
        intensity: log.reactionIntensity,
        notes: log.reactionNotes,
        knownAllergies,
        language,
      }),
    });
    if (!res.ok) {
      patchLog(log.id, { reactionAnalysisStatus: 'error' });
      return null;
    }
    const reactionAnalysis = (await res.json()) as ReactionAnalysis;
    patchLog(log.id, { reactionAnalysis, reactionAnalysisStatus: 'done' });
    return reactionAnalysis;
  } catch {
    patchLog(log.id, { reactionAnalysisStatus: 'error' });
    return null;
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Build a human-readable context summary of a log + its analysis for the chat system prompt. */
export function buildLogSummary(log: MealLog): string {
  const lines: string[] = [];
  if (log.hasReaction) {
    lines.push('Type: allergic reaction log.');
    lines.push(`Context / what was eaten: ${log.mealName || '(not specified)'}`);
    if (log.symptoms?.length) lines.push(`Symptoms: ${log.symptoms.join(', ')}`);
    if (log.reactionIntensity) lines.push(`Reported intensity: ${log.reactionIntensity}`);
    if (log.reactionNotes) lines.push(`Notes: ${log.reactionNotes}`);
    const r = log.reactionAnalysis;
    if (r) {
      lines.push(`AI assessment: ${r.assessment}`);
      if (r.possibleTriggers?.length) lines.push(`AI possible triggers: ${r.possibleTriggers.join(', ')}`);
      lines.push(`AI urgency: ${r.urgency}; confidence: ${r.confidence}`);
    }
  } else {
    lines.push('Type: meal log.');
    lines.push(`Meal: ${log.mealName || '(unnamed)'}`);
    if (log.description) lines.push(`Description: ${log.description}`);
    const a = log.analysis;
    if (a) {
      if (typeof a.calories === 'number') lines.push(`AI estimated calories: ${a.calories} kcal`);
      if (a.macros) lines.push(`AI macros (g): protein ${a.macros.protein_g}, carbs ${a.macros.carbs_g}, fat ${a.macros.fat_g}`);
      if (a.allergens?.length) lines.push(`AI detected allergens: ${a.allergens.join(', ')}`);
      if (a.ingredients?.length) lines.push(`AI inferred ingredients: ${a.ingredients.join(', ')}`);
      lines.push(`AI confidence: ${a.confidence}`);
    }
  }
  return lines.join('\n');
}

export interface ChatResult {
  reply?: string;
  mealUpdate?: Partial<MealAnalysis>;
  reactionUpdate?: Partial<ReactionAnalysis>;
  error?: 'missing_key' | 'other';
}

export async function askAI(
  summary: string,
  messages: ChatMessage[],
  language: Language,
  opts: { photoDataUrl?: string; kind?: 'meal' | 'reaction' } = {}
): Promise<ChatResult> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, messages, language, photoDataUrl: opts.photoDataUrl, kind: opts.kind }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data?.error === 'missing_key' ? 'missing_key' : 'other' };
    }
    const data = (await res.json()) as ChatResult;
    return { reply: data.reply, mealUpdate: data.mealUpdate, reactionUpdate: data.reactionUpdate };
  } catch {
    return { error: 'other' };
  }
}

export interface PatternResult {
  insight?: PatternInsight;
  error?: 'missing_key' | 'other';
}

export async function analyzePatterns(
  logs: MealLog[],
  knownAllergies: string[],
  language: Language
): Promise<PatternResult> {
  const lean = logs.map((l) => ({
    mealName: l.mealName,
    when: l.mealTime ? `${l.createdAt} (${l.mealTime})` : l.createdAt,
    hasReaction: l.hasReaction,
    symptoms: l.symptoms?.length ? l.symptoms : undefined,
    intensity: l.reactionIntensity,
    notes: l.reactionNotes,
    allergens: l.analysis?.allergens ?? l.reactionAnalysis?.possibleTriggers,
    ingredients: l.analysis?.ingredients,
  }));

  try {
    const res = await fetch('/api/analyze-patterns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: lean, knownAllergies, language }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data?.error === 'missing_key' ? 'missing_key' : 'other' };
    }
    const insight = (await res.json()) as PatternInsight;
    const stored = { ...insight, generatedAt: insight.generatedAt ?? new Date().toISOString() };
    localStorage.setItem(STORAGE_KEYS.AI_INSIGHTS, JSON.stringify(stored));
    return { insight: stored };
  } catch {
    return { error: 'other' };
  }
}
