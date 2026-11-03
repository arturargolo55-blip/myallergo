import { MealAnalysis, MealLog, PatternInsight, ReactionAnalysis, STORAGE_KEYS, UserProfile } from '../types';
import { Language, createT } from '../i18n/translations';
import { CUSTOM_PREFIX } from './allergens';

// ─── Daily usage limits ───────────────────────────────────────────────────────
// Soft, client-side guards to avoid accidental cost blowups on one device.
// TODO(auth): replace with real server-side limits tied to user accounts once the
// login step exists. These are NOT security controls — they can be bypassed trivially.
// Separate counters so chat usage can never block meal analyses, and vice-versa.
export const DAILY_ANALYSIS_LIMIT = 30;
export const CHAT_DAILY_LIMIT = 40;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readDailyCount(storageKey: string): number {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return 0;
    const rec = JSON.parse(raw) as { date: string; count: number };
    return rec.date === todayKey() ? rec.count : 0;
  } catch {
    return 0;
  }
}

function bumpDailyCount(storageKey: string) {
  try {
    const count = readDailyCount(storageKey) + 1;
    localStorage.setItem(storageKey, JSON.stringify({ date: todayKey(), count }));
  } catch {
    /* ignore quota errors */
  }
}

export function getUsageToday(): number {
  return readDailyCount(STORAGE_KEYS.USAGE);
}
export function analysesRemaining(): number {
  return Math.max(0, DAILY_ANALYSIS_LIMIT - getUsageToday());
}
function incrementUsage() {
  bumpDailyCount(STORAGE_KEYS.USAGE);
}

export function getChatUsageToday(): number {
  return readDailyCount(STORAGE_KEYS.CHAT_USAGE);
}
export function chatRemaining(): number {
  return Math.max(0, CHAT_DAILY_LIMIT - getChatUsageToday());
}
function incrementChatUsage() {
  bumpDailyCount(STORAGE_KEYS.CHAT_USAGE);
}

export type AnalyzeError = 'missing_key' | 'limit' | 'invalid' | 'timeout' | 'aborted' | 'other';

export interface AnalyzeResult {
  analysis?: MealAnalysis;
  error?: AnalyzeError;
}

/**
 * Fetch-only meal analysis (the model call) for the inline Review-before-Save flow.
 * The CALLER owns cancellation/timeout via `signal` so the UI can drive a progress
 * view and a Cancel button. Still enforces the daily limit and counts usage here.
 * Does NOT touch the logs in localStorage — the log isn't saved yet.
 */
export async function requestMealAnalysis(
  params: {
    mealName: string;
    description?: string;
    photoDataUrl?: string;
    knownAllergies: string[]; // canonical IDs
    language: Language;
  },
  signal?: AbortSignal
): Promise<AnalyzeResult> {
  if (analysesRemaining() <= 0) return { error: 'limit' };
  try {
    incrementUsage(); // count the attempt (we're about to spend an API call)
    const res = await fetch('/api/analyze-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.error === 'missing_key') return { error: 'missing_key' };
      if (data?.error === 'invalid_output') return { error: 'invalid' };
      return { error: 'other' };
    }
    const analysis = (await res.json()) as MealAnalysis;
    return { analysis };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { error: 'aborted' };
    return { error: 'other' };
  }
}

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

/** Allergen identifiers from an analysis, tolerating both v2 and legacy v1 shapes. */
export function analysisAllergenIds(a: MealAnalysis): string[] {
  if (a.detectedAllergens?.length) return [...new Set(a.detectedAllergens.map((m) => m.allergenId))];
  return a.allergens ?? []; // legacy v1
}

/** Ingredient names from an analysis, tolerating both v2 (objects) and legacy v1 (strings). */
export function analysisIngredientNames(a: MealAnalysis): string[] {
  const raw = (a.ingredients ?? []) as Array<string | { name: string }>;
  return raw.map((i) => (typeof i === 'string' ? i : i.name)).filter(Boolean);
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
      const allergenIds = analysisAllergenIds(a);
      if (allergenIds.length) lines.push(`Detected allergens (code-checked): ${allergenIds.join(', ')}`);
      const ings = analysisIngredientNames(a);
      if (ings.length) lines.push(`Ingredients: ${ings.join(', ')}`);
      if (a.riskLevel) lines.push(`Risk level: ${a.riskLevel}`);
    }
  }
  return lines.join('\n');
}

/** Localized allergen label for the context block (id → name, custom → text). */
function allergenName(id: string, language: Language): string {
  if (id.startsWith(CUSTOM_PREFIX)) return id.slice(CUSTOM_PREFIX.length);
  return createT(language)('allergen.' + id);
}

const RECENT_HISTORY_DAYS = 30;
const RECENT_HISTORY_MAX = 60;

/**
 * Compact, data-source-agnostic context for the chat. Takes already-loaded data
 * (localStorage now; a database later — only the caller changes). Kept small to
 * control token cost. Allergen WARNINGS still come from code, never the model.
 */
export function buildUserContext(params: {
  profile: UserProfile;
  currentLog: MealLog;
  logs: MealLog[];
  language: Language;
}): string {
  const { profile, currentLog, logs, language } = params;
  const sections: string[] = [];

  // USER
  const allergyList = (profile.allergies ?? []).map((id) => `${id} (${allergenName(id, language)})`);
  sections.push(
    `USER PROFILE\n` +
      `- Name: ${profile.name || '(unknown)'}\n` +
      `- Registered allergies: ${allergyList.length ? allergyList.join(', ') : 'none'}`
  );

  // CURRENT ITEM (reuses buildLogSummary for the item detail)
  sections.push(`CURRENT ITEM (the user is asking about this)\n${buildLogSummary(currentLog)}`);

  // RECENT HISTORY — last 30 days, newest first, capped at 60 entries.
  const cutoff = Date.now() - RECENT_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const recent = [...logs]
    .filter((l) => l.id !== currentLog.id && new Date(l.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT_HISTORY_MAX);
  if (recent.length) {
    const lines = recent.map((l) => {
      const date = l.createdAt.slice(0, 10);
      const name = (l.mealName || '').slice(0, 40);
      if (l.hasReaction) {
        const triggers = l.reactionAnalysis?.possibleTriggers?.join(', ');
        return `- ${date} reaction "${name}"${l.reactionIntensity ? ` · ${l.reactionIntensity}` : ''}${
          l.symptoms?.length ? ` · ${l.symptoms.join(', ')}` : ''
        }${triggers ? ` · triggers: ${triggers}` : ''}`;
      }
      const ids = l.analysis ? analysisAllergenIds(l.analysis) : [];
      return `- ${date} meal "${name}"${l.analysis?.riskLevel ? ` · risk ${l.analysis.riskLevel}` : ''}${
        ids.length ? ` (${ids.join(', ')})` : ''
      }`;
    });
    sections.push(`RECENT HISTORY (last ${RECENT_HISTORY_DAYS} days, newest first)\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}

export type ChatError = 'missing_key' | 'limit' | 'other';

export interface ChatResult {
  reply?: string;
  error?: ChatError;
}

/**
 * Read-only chat. The chat can never modify stored data — it only returns text.
 * Counts toward the separate chat daily limit. Sends only the last ~10 messages
 * plus the compact user context (no photo).
 */
export async function askAI(
  userContext: string,
  messages: ChatMessage[],
  language: Language,
  opts: { kind?: 'meal' | 'reaction' } = {}
): Promise<ChatResult> {
  if (chatRemaining() <= 0) return { error: 'limit' };
  try {
    incrementChatUsage();
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userContext,
        messages: messages.slice(-10), // control token cost
        language,
        kind: opts.kind,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.error === 'missing_key') return { error: 'missing_key' };
      return { error: 'other' };
    }
    const data = (await res.json()) as ChatResult;
    return { reply: data.reply };
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
    allergens: l.analysis ? analysisAllergenIds(l.analysis) : l.reactionAnalysis?.possibleTriggers,
    ingredients: l.analysis ? analysisIngredientNames(l.analysis) : undefined,
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
