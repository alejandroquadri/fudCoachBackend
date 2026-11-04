import test from 'node:test';
import assert from 'node:assert/strict';
import { BarcodeError, BarcodeService } from '../src/services/barcode.service';

const raw = {
  status: 1,
  product: {
    code: '3017620422003',
    product_name: 'Spread',
    brands: 'Example',
    serving_quantity: 20,
    serving_quantity_unit: 'g',
    nutriments: {
      'energy-kcal_100g': 500,
      proteins_100g: 5,
      carbohydrates_100g: 50,
      fat_100g: 30,
    },
  },
};
const response = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

test('barcode lookup snapshots exact product nutrition and caches requests', async () => {
  let calls = 0;
  const service = new BarcodeService(async () => {
    calls++;
    return response(raw);
  });
  const product = await service.lookup('3017620422003');
  assert.equal(
    (await service.lookup('3017620422003')).version,
    product.version
  );
  assert.equal(calls, 1);
  const meal = service.meal(product, 40);
  assert.equal(meal.calories, 200);
  assert.equal(meal.carbs, 20);
  assert.equal(meal.nutrition?.source, 'open_food_facts');
  if (meal.nutrition?.source === 'open_food_facts')
    assert.equal(meal.nutrition.barcode, '3017620422003');
  assert.throws(() => service.meal(product, 0), BarcodeError);
});

test('rejects missing, mismatched, incomplete and liquid product data', async () => {
  const cases = [
    [{ status: 0 }, 'not_found'],
    [{ ...raw, product: { ...raw.product, code: '12345678' } }, 'not_found'],
    [{ ...raw, product: { ...raw.product, nutriments: {} } }, 'incomplete'],
    [
      { ...raw, product: { ...raw.product, serving_quantity_unit: 'ml' } },
      'incomplete',
    ],
  ] as const;
  for (const [body, expected] of cases) {
    const service = new BarcodeService(async () => response(body));
    await assert.rejects(
      service.lookup('3017620422003'),
      (error: unknown) =>
        error instanceof BarcodeError && error.code === expected
    );
  }
  await assert.rejects(
    new BarcodeService().lookup('not-a-barcode'),
    (error: unknown) =>
      error instanceof BarcodeError && error.code === 'invalid'
  );
});
