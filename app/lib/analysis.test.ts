import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MealModelSchema,
  buildMealAnalysis,
  dedupeSuggestions,
  mergeStatedIngredients,
  computeProgress,
  formatAmount,
  parseAmount,
  type MealModel,
  type ProgressStep,
  type StepState,
} from './analysis.ts';
import { computeRiskLevel, crossCheckAllergens } from './allergens.ts';

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
    clarifyingQuestion: { question: 'How much butter?', options: ['~1 tsp', '~1 tbsp', 'more'] },
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
