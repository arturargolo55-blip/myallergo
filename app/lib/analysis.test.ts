import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MealModelSchema,
  buildMealAnalysis,
  dedupeSuggestions,
  mergeStatedIngredients,
  computeProgress,
  computeTableCalories,
  applyCalorieSanity,
  shouldShowClarifyingQuestion,
  formatAmount,
  parseAmount,
  type MealModel,
  type ProgressStep,
  type StepState,
} from './analysis.ts';
import { computeRiskLevel, crossCheckAllergens } from './allergens.ts';
import type { MealAnalysis } from '../types.ts';

const baseModel = (over: Partial<MealModel> = {}): MealModel => ({
  sourceType: 'plate',
  ingredients: [{ name: 'white rice', confidence: 'likely' }],
  macrosAreEstimate: true,
  traces: [],
  possibleHiddenAllergens: [],
  ...over,
});

test('MealModelSchema accepts a valid payload (with amounts + stated)', () => {
  const r = MealModelSchema.safeParse({
    sourceType: 'text',
    ingredients: [
      { name: 'eggs', confidence: 'stated', amount: 2, unit: 'eggs' },
      { name: 'butter', confidence: 'likely', amount: 10, unit: 'g' },
    ],
    calorieRange: { min: 190, estimate: 240, max: 290, reason: 'unknown butter amount' },
    macros: { protein_g: 13, carbs_g: 1, fat_g: 20 },
    macrosAreEstimate: true,
    traces: [],
    possibleHiddenAllergens: [],
    clarifyingQuestion: { id: 'added_fat_amount', text: 'How much butter?', options: ['~1 tsp', '~1 tbsp', 'more'] },
    absorbedFraction: 0.5,
  });
  assert.ok(r.success);
});

test('MealModelSchema rejects bad confidence and missing required fields', () => {
  assert.equal(MealModelSchema.safeParse({ ...baseModel(), ingredients: [{ name: 'x', confidence: 'high' }] }).success, false);
  assert.equal(MealModelSchema.safeParse({ sourceType: 'plate' }).success, false);
});

test('calorieRange enforces min <= estimate <= max', () => {
  const ok = MealModelSchema.safeParse(baseModel({ calorieRange: { min: 100, estimate: 150, max: 200 } }));
  assert.ok(ok.success);
  const bad = MealModelSchema.safeParse(baseModel({ calorieRange: { min: 300, estimate: 150, max: 200 } }));
  assert.equal(bad.success, false);
});

test('parseAmount / formatAmount round-trip', () => {
  assert.deepEqual(parseAmount('2 eggs'), { amount: 2, unit: 'eggs' });
  assert.deepEqual(parseAmount('10 g'), { amount: 10, unit: 'g' });
  assert.deepEqual(parseAmount('1,5 tbsp'), { amount: 1.5, unit: 'tbsp' });
  assert.deepEqual(parseAmount('12'), { amount: 12, unit: undefined });
  assert.equal(formatAmount({ amount: 2, unit: 'eggs' }), '2 eggs');
  assert.equal(formatAmount({ amount: 10, unit: 'g' }), '10 g');
  assert.equal(formatAmount({}), '');
});

test('"stated" ranks as a match (not downgraded like uncertain)', () => {
  const a = buildMealAnalysis(
    baseModel({ ingredients: [{ name: 'leite', confidence: 'stated' }] }),
    ['milk']
  );
  assert.equal(a.riskLevel, 'detected');
  assert.equal(a.detectedAllergens.find((m) => m.allergenId === 'milk')?.strength, 'match');
  // confidence preserved on the stored ingredient
  assert.equal(a.ingredients?.[0].confidence, 'stated');
});

test('buildMealAnalysis sets calories from the range estimate', () => {
  const a = buildMealAnalysis(baseModel({ calorieRange: { min: 190, estimate: 240, max: 290 } }), []);
  assert.equal(a.calories, 240);
  assert.equal(a.calorieRange?.max, 290);
});

test('dedupeSuggestions drops items covered by ingredients or detected allergens', () => {
  const detected = crossCheckAllergens([{ name: 'queijo' }], ['milk']); // milk detected
  const out = dedupeSuggestions(
    ['milk', 'cheese', 'sesame', 'soy'],
    [{ name: 'sesame seeds' }],
    detected
  );
  // 'milk'/'cheese' covered by detected milk; 'sesame' covered by listed ingredient.
  assert.deepEqual(out, ['soy']);
});

test('mergeStatedIngredients keeps user edits, adds new, never drops', () => {
  const stated = [{ name: 'butter', confidence: 'stated' as const, amount: 15, unit: 'g' }];
  const fresh = [
    { name: 'Butter', confidence: 'likely' as const, amount: 5, unit: 'g' }, // same (case/dup) → stated wins
    { name: 'bread', confidence: 'likely' as const },
  ];
  const merged = mergeStatedIngredients(fresh, stated);
  const butter = merged.find((i) => i.name.toLowerCase() === 'butter');
  assert.equal(merged.length, 2);
  assert.equal(butter?.amount, 15); // user's amount kept, not the fresh 5
  assert.equal(butter?.confidence, 'stated');
  assert.ok(merged.some((i) => i.name === 'bread')); // new info added
});

// ─── Clarifying-question lifecycle ──────────────────────────────────────────────
const withQuestion = (id: 'added_fat_amount' | 'portion_size'): MealModel =>
  baseModel({ clarifyingQuestion: { id, text: 'How much?', options: ['a', 'b'] } });

test('answered clarifying id is dropped by buildMealAnalysis', () => {
  const kept = buildMealAnalysis(withQuestion('added_fat_amount'), []);
  assert.ok(kept.clarifyingQuestion); // not answered yet → kept
  const dropped = buildMealAnalysis(withQuestion('added_fat_amount'), [], { answeredIds: ['added_fat_amount'] });
  assert.equal(dropped.clarifyingQuestion, undefined);
});

test('clarifying question dropped once the round cap is reached', () => {
  const dropped = buildMealAnalysis(withQuestion('portion_size'), [], { priorRounds: 2 });
  assert.equal(dropped.clarifyingQuestion, undefined);
  const kept = buildMealAnalysis(withQuestion('portion_size'), [], { priorRounds: 1 });
  assert.ok(kept.clarifyingQuestion);
});

test('shouldShowClarifyingQuestion: answered / dismissed / capped / fresh', () => {
  const q = { id: 'added_fat_amount' as const, text: 'How much butter?' };
  const base = (over: Partial<MealAnalysis>): MealAnalysis =>
    ({ sourceType: 'text', macrosAreEstimate: true, detectedAllergens: [], riskLevel: 'none_detected', userEdited: false, analyzedAt: '', clarifyingQuestion: q, ...over } as MealAnalysis);
  assert.equal(shouldShowClarifyingQuestion(base({})), true);
  assert.equal(shouldShowClarifyingQuestion(base({ clarifyDismissed: true })), false);
  assert.equal(
    shouldShowClarifyingQuestion(base({ clarifications: [{ id: 'added_fat_amount', question: 'x', answer: 'y', ts: '' }] })),
    false
  );
  assert.equal(
    shouldShowClarifyingQuestion(
      base({ clarifications: [
        { id: 'portion_size', question: 'x', answer: 'y', ts: '' },
        { id: 'sauce_type', question: 'x', answer: 'y', ts: '' },
      ] })
    ),
    false // 2 rounds reached
  );
});

// ─── Calorie sanity-check ───────────────────────────────────────────────────────
test('computeTableCalories prices eggs + butter with absorbed fraction', () => {
  const ings = [
    { name: 'ovos', confidence: 'stated' as const, amount: 2, unit: 'eggs' },
    { name: 'manteiga', confidence: 'stated' as const, amount: 2, unit: 'tbsp' },
  ];
  const eaten = computeTableCalories(ings, 1.0); // all fat eaten
  const half = computeTableCalories(ings, 0.5); // half stays in pan
  assert.ok(eaten && half);
  assert.ok(eaten!.kcal > half!.kcal); // less butter eaten → fewer kcal
});

test('applyCalorieSanity widens the range only when totals disagree > 25%', () => {
  const make = (estimate: number): MealAnalysis => ({
    sourceType: 'text',
    ingredients: [
      { name: 'ovos', confidence: 'stated', amount: 2, unit: 'eggs' },
      { name: 'manteiga', confidence: 'stated', amount: 2, unit: 'tbsp' },
    ],
    calories: estimate,
    calorieRange: { min: estimate - 20, estimate, max: estimate + 20 },
    macrosAreEstimate: true,
    detectedAllergens: [],
    riskLevel: 'none_detected',
    userEdited: false,
    analyzedAt: '',
    absorbedFraction: 1.0, // table ≈ 143 (eggs) + 201 (28g butter) ≈ 344 kcal
  });
  const off = applyCalorieSanity(make(150)); // far from ~344 → widen
  assert.equal(off.calorieNote, 'range_widened');
  assert.ok(off.calorieRange!.max >= 344);
  const ok = applyCalorieSanity(make(340)); // close to ~344 → no widen
  assert.equal(ok.calorieNote, undefined);
});

test('computeProgress is monotonic and capped below 0.85 mid-model', () => {
  const s = (over: Partial<Record<ProgressStep, StepState>>): Record<ProgressStep, StepState> => ({
    prepare: 'pending',
    model: 'pending',
    crosscheck: 'pending',
    build: 'pending',
    ...over,
  });
  const prepare = computeProgress(s({ prepare: 'active' }), 0);
  const prepareDone = computeProgress(s({ prepare: 'done' }), 0);
  const model0 = computeProgress(s({ prepare: 'done', model: 'active' }), 0);
  const model30 = computeProgress(s({ prepare: 'done', model: 'active' }), 30);
  const modelDone = computeProgress(s({ model: 'done' }), 0);
  const build = computeProgress(s({ build: 'done' }), 0);

  assert.ok(prepare < prepareDone);
  assert.ok(prepareDone <= model0);
  assert.ok(model0 < model30);
  assert.ok(model30 < 0.85, `model must stay <0.85, got ${model30}`);
  assert.ok(modelDone >= 0.85 && modelDone < build);
  assert.equal(build, 1);
});
