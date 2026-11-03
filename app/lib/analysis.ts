/**
 * Pure, isomorphic meal-analysis helpers shared by the API route and the client.
 * No network, no DOM — safe to unit-test. The model only EXTRACTS; allergen warnings
 * are computed here in code via lib/allergens.
 */
import { z } from 'zod';
import {
  crossCheckAllergens,
  computeRiskLevel,
  normalize,
  type AllergenMatch,
} from './allergens';
import type { AnalyzedIngredient, CalorieRange, MealAnalysis } from '../types';

// ─── Model-output contract (zod is the source of truth) ─────────────────────────
export const IngredientZ = z.object({
  name: z.string().min(1),
  confidence: z.enum(['stated', 'label', 'likely', 'uncertain']),
  amount: z.number().positive().nullish(),
  unit: z.string().nullish(),
});

export const CalorieRangeZ = z
  .object({
    min: z.number().nonnegative(),
    estimate: z.number().nonnegative(),
    max: z.number().nonnegative(),
    reason: z.string().nullish(),
  })
  // Guard against min<=estimate<=max violations from the model.
  .refine((r) => r.min <= r.estimate && r.estimate <= r.max, {
    message: 'calorieRange must satisfy min <= estimate <= max',
  });

export const ClarifyingQuestionZ = z.object({
  question: z.string().min(1),
  options: z.array(z.string()).nullish(),
});

export const MealModelSchema = z.object({
  sourceType: z.enum(['label', 'plate', 'text']),
  ingredients: z.array(IngredientZ),
  calorieRange: CalorieRangeZ.nullish(),
  calories: z.number().nullish(), // fallback point estimate if no range
  macros: z.object({ protein_g: z.number(), carbs_g: z.number(), fat_g: z.number() }).nullish(),
  macrosAreEstimate: z.boolean(),
  traces: z.array(z.string()).default([]),
  possibleHiddenAllergens: z.array(z.string()).default([]),
  clarifyingQuestion: ClarifyingQuestionZ.nullish(),
});
export type MealModel = z.infer<typeof MealModelSchema>;

// JSON schema handed to the model (kept in sync with the zod shape above).
export const MEAL_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sourceType: { type: 'string', enum: ['label', 'plate', 'text'] },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          confidence: { type: 'string', enum: ['stated', 'label', 'likely', 'uncertain'] },
          amount: { type: 'number', description: 'Estimated quantity value, e.g. 2 or 10. Omit if unknown.' },
          unit: { type: 'string', description: 'Unit for amount, e.g. "eggs", "g", "ml", "tbsp". Omit if unknown.' },
        },
        required: ['name', 'confidence'],
      },
    },
    calorieRange: {
      type: 'object',
      additionalProperties: false,
      properties: {
        min: { type: 'integer' },
        estimate: { type: 'integer' },
        max: { type: 'integer' },
        reason: { type: 'string', description: 'Short reason when the band is wide.' },
      },
      required: ['min', 'estimate', 'max'],
    },
    calories: { type: 'integer', description: 'Point estimate if no range; null if unknown.' },
    macros: {
      type: 'object',
      additionalProperties: false,
      properties: { protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' } },
      required: ['protein_g', 'carbs_g', 'fat_g'],
    },
    macrosAreEstimate: { type: 'boolean' },
    traces: { type: 'array', items: { type: 'string' } },
    possibleHiddenAllergens: { type: 'array', items: { type: 'string' } },
    clarifyingQuestion: {
      type: 'object',
      additionalProperties: false,
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
      },
      required: ['question'],
    },
  },
  required: ['sourceType', 'ingredients', 'macrosAreEstimate', 'traces', 'possibleHiddenAllergens'],
} as const;

// ─── Suggestion de-duplication (D13) ────────────────────────────────────────────
/** Drop suggestions already covered by a listed ingredient or an already-detected allergen. */
export function dedupeSuggestions(
  suggestions: string[],
  ingredients: { name: string }[],
  detected: AllergenMatch[]
): string[] {
  const ingredientWords = new Set(ingredients.flatMap((i) => normalize(i.name).split(' ')));
  const detectedIds = new Set(detected.map((m) => m.allergenId));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of suggestions) {
    const norm = normalize(s);
    if (!norm || seen.has(norm)) continue;
    // Covered by an ingredient the model already listed?
    if (norm.split(' ').some((w) => ingredientWords.has(w))) continue;
    // Covered by an allergen the code already flagged on this meal?
    const asMatches = crossCheckAllergens([s], [...detectedIds]);
    if (asMatches.some((m) => detectedIds.has(m.allergenId))) continue;
    seen.add(norm);
    out.push(s);
  }
  return out;
}

// ─── Build the stored analysis from the model output (code owns allergens) ──────
function dedupeMatches(matches: AllergenMatch[]): AllergenMatch[] {
  const best = new Map<string, AllergenMatch>();
  for (const m of matches) {
    const key = `${m.allergenId}::${m.ingredient.toLowerCase()}`;
    const prev = best.get(key);
    if (!prev || (prev.strength === 'possible' && m.strength === 'match')) best.set(key, m);
  }
  return [...best.values()];
}

export function buildMealAnalysis(model: MealModel, allergyIds: string[]): MealAnalysis {
  const ingredientMatches = crossCheckAllergens(model.ingredients, allergyIds);
  const traceMatches = crossCheckAllergens(model.traces ?? [], allergyIds, { baseStrength: 'possible' });
  const hiddenMatches = crossCheckAllergens(model.possibleHiddenAllergens ?? [], allergyIds, { baseStrength: 'possible' });
  const detectedAllergens = dedupeMatches([...ingredientMatches, ...traceMatches, ...hiddenMatches]);

  const suggestions = dedupeSuggestions(model.possibleHiddenAllergens ?? [], model.ingredients, detectedAllergens);
  const calorieRange: CalorieRange | undefined = model.calorieRange
    ? {
        min: model.calorieRange.min,
        estimate: model.calorieRange.estimate,
        max: model.calorieRange.max,
        reason: model.calorieRange.reason ?? undefined,
      }
    : undefined;
  const calories = calorieRange ? calorieRange.estimate : model.calories ?? undefined;

  return {
    sourceType: model.sourceType,
    ingredients: model.ingredients.map((i) => ({
      name: i.name,
      confidence: i.confidence,
      amount: i.amount ?? undefined,
      unit: i.unit ?? undefined,
    })),
    calories,
    calorieRange,
    macros: model.macros ?? undefined,
    macrosAreEstimate: model.macrosAreEstimate,
    traces: model.traces,
    possibleHiddenAllergens: suggestions,
    clarifyingQuestion: model.clarifyingQuestion
      ? { question: model.clarifyingQuestion.question, options: model.clarifyingQuestion.options ?? undefined }
      : undefined,
    detectedAllergens,
    riskLevel: computeRiskLevel(detectedAllergens),
    userEdited: false,
    analyzedAt: new Date().toISOString(),
  };
}

// ─── Edit-preserving re-run merge (B') ──────────────────────────────────────────
/**
 * Merge the user's previously-edited (stated) ingredients into a fresh analysis so a
 * re-run can ADD information but never silently overwrites the user's corrections.
 * Stated ingredients are kept verbatim (name/amount/unit, confidence 'stated'); the
 * re-run may contribute new ingredients not already present. Allergens/risk are then
 * recomputed by the caller from the merged ingredient list.
 */
export function mergeStatedIngredients(
  fresh: AnalyzedIngredient[],
  stated: AnalyzedIngredient[]
): AnalyzedIngredient[] {
  const key = (n: string) => normalize(n);
  const statedKeys = new Set(stated.map((i) => key(i.name)));
  const kept: AnalyzedIngredient[] = stated.map((i) => ({ ...i, confidence: 'stated' }));
  for (const f of fresh) {
    if (!statedKeys.has(key(f.name))) kept.push(f);
  }
  return kept;
}

// ─── Honest progress bar (A3) ───────────────────────────────────────────────────
export type ProgressStep = 'prepare' | 'model' | 'crosscheck' | 'build';
export type StepState = 'pending' | 'active' | 'done' | 'failed';

/**
 * Map real phase states + elapsed seconds to a 0..1 bar. During the model call the bar
 * eases asymptotically toward 0.85 and never reaches it until the response is validated;
 * crosscheck → 0.92, build complete → 1. Monotonic within a run.
 */
export function computeProgress(steps: Record<ProgressStep, StepState>, elapsedSec: number): number {
  if (steps.build === 'done') return 1;
  if (steps.build === 'active') return 0.96;
  if (steps.crosscheck === 'done') return 0.92;
  if (steps.crosscheck === 'active') return 0.88;
  if (steps.model === 'done') return 0.86;
  if (steps.model === 'active' || steps.model === 'failed') {
    // Ease 0.2 → 0.85 (cap), ~half-life 10s. Never reaches 0.85 until model is done.
    const eased = 0.2 + 0.65 * (1 - Math.exp(-Math.max(0, elapsedSec) / 10));
    return Math.min(0.849, eased);
  }
  if (steps.prepare === 'done') return 0.18;
  if (steps.prepare === 'active') return 0.08;
  return 0.02;
}

// ─── Amount helpers (D8 / E15) ──────────────────────────────────────────────────
/** "2 eggs", "10 g", "1 tbsp" — or "" when no amount. */
export function formatAmount(ing: { amount?: number; unit?: string }): string {
  if (ing.amount == null) return '';
  const n = Number.isInteger(ing.amount) ? String(ing.amount) : ing.amount.toFixed(1);
  return ing.unit ? `${n} ${ing.unit}` : n;
}

/** Parse "2 eggs" / "10 g" / "1.5 tbsp" / "12" into {amount, unit}. */
export function parseAmount(input: string): { amount?: number; unit?: string } {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(input.trim());
  if (!m) return {};
  const amount = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].trim();
  return { amount: Number.isFinite(amount) ? amount : undefined, unit: unit || undefined };
}
