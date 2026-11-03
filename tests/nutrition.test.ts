import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeUsdaFood,
  UsdaError,
  UsdaService,
} from '../src/services/usda.service';
import {
  calculateMeal,
  MealNutritionService,
} from '../src/services/ai/meal-nutrition.service';
import { MealItem } from '../src/services/ai/ai-schemas';
import { AiModelService } from '../src/services/ai/ai-model.service';

export const riceItem: MealItem = {
  name: 'Cooked rice',
  searchQuery: 'rice white cooked',
  brand: null,
  preparation: 'cooked',
  amount: 150,
  unit: 'g',
  portionDescription: '150 g cooked rice',
  estimatedGrams: 150,
  quantityEstimated: false,
  serving_size: 'medium',
};

const rawRice = () => ({
  fdcId: 123,
  description: 'Rice, white, cooked',
  dataType: 'SR Legacy',
  foodNutrients: [
    { nutrient: { id: 1008, unitName: 'kcal' }, amount: 130 },
    { nutrient: { id: 1003, unitName: 'g' }, amount: 2.69 },
    { nutrient: { id: 1004, unitName: 'g' }, amount: 0.28 },
    { nutrient: { id: 1005, unitName: 'g' }, amount: 28.17 },
  ],
  foodPortions: [
    {
      id: 12,
      gramWeight: 158,
      amount: 1,
      modifier: 'cup',
      measureUnit: { name: 'undetermined' },
    },
  ],
});

test('calculates nutrients from USDA values and retains the exact snapshot', () => {
  const food = normalizeUsdaFood(rawRice(), new Date('2026-10-25T12:00:00Z'));
  const meal = calculateMeal(riceItem, food)!;
  assert.equal(meal.calories, 195);
  assert.equal(meal.protein, 4.04);
  assert.equal(meal.carbs, 42.26);
  assert.equal(meal.fat, 0.42);
  assert.equal(meal.quantity, 1);
  assert.equal(meal.nutrition?.grams, 150);
  assert.equal(meal.nutrition?.quantitySource, 'user');
  assert.deepEqual(meal.nutrition?.per100g, food.per100g);
  assert.equal(meal.nutrition?.retrievedAt, '2026-10-25T12:00:00.000Z');
});

test('resolves household portions using USDA and converts mass units', () => {
  const food = normalizeUsdaFood(rawRice());
  const cup = calculateMeal(
    { ...riceItem, amount: 2, unit: 'cup', estimatedGrams: 200 },
    food
  )!;
  assert.equal(cup.nutrition?.grams, 316);
  assert.equal(cup.nutrition?.quantitySource, 'usda_portion');
  assert.equal(cup.quantity, 2);
  const ounces = calculateMeal({ ...riceItem, amount: 4, unit: 'oz' }, food)!;
  assert.equal(ounces.nutrition?.grams, 113.4);
  assert.equal(ounces.calories, 147);
});

test('labels estimated portions and never assumes a volume has the same weight', () => {
  const food = normalizeUsdaFood(rawRice());
  const estimated = calculateMeal(
    {
      ...riceItem,
      amount: 1,
      unit: 'serving',
      estimatedGrams: 180,
      quantityEstimated: true,
    },
    food
  )!;
  assert.equal(estimated.nutrition?.quantitySource, 'ai_estimate');
  assert.equal(estimated.nutrition?.grams, 180);
  assert.equal(
    calculateMeal({ ...riceItem, unit: 'ml', estimatedGrams: null }, food),
    null
  );
  assert.equal(
    calculateMeal({ ...riceItem, unit: 'g', amount: 10001 }, food),
    null
  );
});

test('does not choose the first of conflicting household portions', () => {
  const food = normalizeUsdaFood({
    ...rawRice(),
    foodPortions: [
      { id: 1, gramWeight: 150, amount: 1, modifier: 'cup loose' },
      { id: 2, gramWeight: 200, amount: 1, modifier: 'cup packed' },
    ],
  });
  assert.equal(
    calculateMeal(
      { ...riceItem, amount: 1, unit: 'cup', estimatedGrams: null },
      food
    ),
    null
  );
});

test('rejects missing nutrients, preserves zero, and handles kcal and kJ energy', () => {
  const raw = rawRice();
  assert.throws(
    () =>
      normalizeUsdaFood({ ...raw, foodNutrients: raw.foodNutrients.slice(1) }),
    UsdaError
  );
  const zeroFat = {
    ...raw,
    foodNutrients: raw.foodNutrients.map(entry =>
      entry.nutrient.id === 1004 ? { ...entry, amount: 0 } : entry
    ),
  };
  assert.equal(normalizeUsdaFood(zeroFat).per100g.fat, 0);
  raw.foodNutrients[0] = {
    nutrient: { id: 1062, unitName: 'kJ' },
    amount: 543.92,
  };
  assert.ok(Math.abs(normalizeUsdaFood(raw).per100g.calories - 130) < 1e-9);
  raw.foodNutrients[0] = {
    nutrient: { id: 2048, unitName: 'kcal' },
    amount: 131,
  };
  assert.equal(normalizeUsdaFood(raw).per100g.calories, 131);
});

test('deduplicates USDA calls, caches details, and keeps keys out of URLs', async () => {
  let requests = 0;
  const fetcher: typeof fetch = async (input, init) => {
    requests++;
    assert.ok(!String(input).includes('test-secret'));
    assert.equal(
      (init?.headers as Record<string, string>)['X-Api-Key'],
      'test-secret'
    );
    return new Response(JSON.stringify(rawRice()), { status: 200 });
  };
  const catalog = new UsdaService(() => 'test-secret', fetcher);
  const foods = await Promise.all([catalog.getFood(123), catalog.getFood(123)]);
  assert.equal(foods[0].fdcId, 123);
  await catalog.getFood(123);
  assert.equal(requests, 1);
});

test('does not retry USDA throttling and redacts transport/configuration failures', async () => {
  let calls = 0;
  const catalog = new UsdaService(
    () => 'private-key',
    async () => {
      calls++;
      return new Response('', { status: 429 });
    }
  );
  await assert.rejects(
    catalog.getFood(123),
    (error: UsdaError) =>
      error.code === 'rate_limit' && !error.message.includes('private-key')
  );
  await assert.rejects(catalog.getFood(123), UsdaError);
  assert.equal(calls, 1);
  await assert.rejects(
    new UsdaService(() => undefined).getFood(123),
    (error: UsdaError) => error.code === 'configuration'
  );
});

test('searches unbranded foods separately and never accepts an arbitrary model identifier', async () => {
  const food = normalizeUsdaFood(rawRice());
  let lookups = 0;
  const models = {
    structured: async () => ({
      matches: [{ itemIndex: 0, fdcId: 999, question: null }],
    }),
  } as unknown as Pick<AiModelService, 'structured'>;
  const service = new MealNutritionService(models, {
    search: async () => [food],
    getFood: async () => {
      lookups++;
      return food;
    },
  });
  assert.equal(
    (
      await service.resolve([riceItem], {
        runId: 'r',
        calls: 0,
        deadline: Date.now() + 10000,
      })
    ).outcome,
    'clarify'
  );
  assert.equal(lookups, 0);
});

test('rejects raw/cooked substitutions and resolves every item before returning a meal', async () => {
  const food = normalizeUsdaFood(rawRice());
  const models = {
    structured: async () => ({
      matches: [{ itemIndex: 0, fdcId: 123, question: null }],
    }),
  } as unknown as Pick<AiModelService, 'structured'>;
  const service = new MealNutritionService(models, {
    search: async () => [{ ...food, description: 'Rice, white, raw' }],
    getFood: async () => food,
  });
  assert.equal(
    (
      await service.resolve([riceItem], {
        runId: 'r',
        calls: 0,
        deadline: Date.now() + 10000,
      })
    ).outcome,
    'clarify'
  );
});
