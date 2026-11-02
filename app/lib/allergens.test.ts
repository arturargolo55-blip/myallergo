import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crossCheckAllergens,
  computeRiskLevel,
  detectedAllergenIds,
  migrateAllergies,
  normalize,
} from './allergens.ts';

function risk(ingredients: Array<string | { name: string; confidence?: 'label' | 'likely' | 'uncertain' }>, ids: string[]) {
  const m = crossCheckAllergens(ingredients, ids);
  return { level: computeRiskLevel(m), ids: detectedAllergenIds(m), matches: m };
}

test('peanut butter: no milk match, but peanut detected', () => {
  assert.equal(risk(['peanut butter'], ['milk']).ids.includes('milk'), false);
  assert.equal(risk(['peanut butter'], ['milk']).level, 'none_detected');

  const p = risk(['peanut butter'], ['peanut']);
  assert.ok(p.ids.includes('peanut'));
  assert.equal(p.level, 'detected');
});

test('coconut milk: possible (exception), not detected, not none', () => {
  const r = risk(['coconut milk'], ['milk']);
  assert.equal(r.level, 'possible');
  assert.ok(r.ids.includes('milk'));
  assert.equal(r.matches.find((m) => m.allergenId === 'milk')?.strength, 'possible');
});

test('leite de coco (PT): possible (exception)', () => {
  const r = risk(['leite de coco'], ['milk']);
  assert.equal(r.level, 'possible');
});

test('cocoa butter / manteiga de cacau: not detected (downgraded to possible)', () => {
  assert.equal(risk(['cocoa butter'], ['milk']).level, 'possible');
  assert.equal(risk(['manteiga de cacau'], ['milk']).level, 'possible');
});

test('nutmeg / noz-moscada: not detected as tree nut (exception cancels)', () => {
  assert.equal(risk(['nutmeg'], ['tree_nuts']).ids.includes('tree_nuts'), false);
  assert.equal(risk(['noz-moscada'], ['tree_nuts']).ids.includes('tree_nuts'), false);
  // but a real walnut still matches
  assert.ok(risk(['nozes'], ['tree_nuts']).ids.includes('tree_nuts'));
});

test('gluten-free bread / pão sem glúten: gluten negated → none_detected', () => {
  assert.equal(risk(['gluten-free bread'], ['gluten']).level, 'none_detected');
  assert.equal(risk(['pão sem glúten'], ['gluten']).level, 'none_detected');
});

test('lactose-free milk / leite sem lactose: milk still detected (parent not negated)', () => {
  const en = risk(['lactose-free milk'], ['milk']);
  assert.equal(en.level, 'detected');
  assert.ok(en.ids.includes('milk'));

  const pt = risk(['leite sem lactose'], ['milk']);
  assert.equal(pt.level, 'detected');
  assert.ok(pt.ids.includes('milk'));
});

test('accents and plurals', () => {
  assert.ok(risk(['Ovos'], ['egg']).ids.includes('egg'));
  assert.ok(risk(['amêndoas'], ['tree_nuts']).ids.includes('tree_nuts'));
  assert.ok(risk(['amendoas'], ['tree_nuts']).ids.includes('tree_nuts'));
  assert.ok(risk(['Castanha de Caju'], ['tree_nuts']).ids.includes('tree_nuts'));
  assert.equal(normalize('Pão com Açúcar'), 'pao com acucar');
});

test('uncertain ingredient → possible, not detected', () => {
  const r = risk([{ name: 'queijo', confidence: 'uncertain' }], ['milk']);
  assert.equal(r.level, 'possible');
});

test('end-to-end PT example: pizza de calabresa com queijo', () => {
  const ingredients = ['massa de trigo', 'queijo muçarela', 'calabresa', 'molho de tomate'];
  const r = risk(ingredients, ['milk', 'gluten']);
  assert.equal(r.level, 'detected');
  assert.ok(r.ids.includes('milk'));
  assert.ok(r.ids.includes('gluten'));
});

test('end-to-end EN example: grilled salmon with sesame sauce', () => {
  const ingredients = ['grilled salmon', 'sesame sauce', 'white rice'];
  const r = risk(ingredients, ['fish', 'sesame', 'peanut']);
  assert.ok(r.ids.includes('fish'));
  assert.ok(r.ids.includes('sesame'));
  assert.equal(r.ids.includes('peanut'), false);
  assert.equal(r.level, 'detected');
});

test('no allergens for the user → none_detected', () => {
  assert.equal(risk(['white rice', 'olive oil'], ['milk', 'peanut']).level, 'none_detected');
});

test('migrateAllergies: old PT labels → IDs, custom preserved', () => {
  assert.deepEqual(migrateAllergies(['Leite / Lactose', 'Ovos']).sort(), ['egg', 'milk']);
  assert.deepEqual(migrateAllergies(['Frutos do mar']).sort(), ['crustaceans', 'molluscs']);
  assert.deepEqual(migrateAllergies(['milk']), ['milk']); // already an ID
  assert.deepEqual(migrateAllergies(['Kiwi']), ['custom:Kiwi']); // unknown → custom
});
