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
