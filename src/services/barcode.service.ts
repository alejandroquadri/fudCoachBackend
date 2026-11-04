import { createHash } from 'crypto';
import { AiFoodLogPayload } from '../types';

export type BarcodeProduct = {
  barcode: string;
  name: string;
  brand: string;
  imageUrl?: string;
  per100g: { calories: number; protein: number; carbs: number; fat: number };
  servingGrams?: number;
  retrievedAt: string;
  version: string;
};

export class BarcodeError extends Error {
  constructor(
    public readonly code:
      'invalid' | 'not_found' | 'incomplete' | 'unavailable' | 'changed'
  ) {
    super(code);
  }
}

export class BarcodeService {
  private cache = new Map<
    string,
    { product: BarcodeProduct; expires: number }
  >();
  private requests: number[] = [];
  private inFlight = new Map<string, Promise<BarcodeProduct>>();
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async lookup(code: string): Promise<BarcodeProduct> {
    if (!/^\d{8,14}$/.test(code) || ![8, 12, 13, 14].includes(code.length))
      throw new BarcodeError('invalid');
    const key = code.padStart(14, '0');
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.product;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    this.requests = this.requests.filter(t => t > Date.now() - 60_000);
    if (this.requests.length >= 14) throw new BarcodeError('unavailable');
    this.requests.push(Date.now());
    const request = this.fetchProduct(code)
      .then(product => {
        if (this.cache.size >= 500)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { product, expires: Date.now() + 30 * 60_000 });
        return product;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  private async fetchProduct(code: string): Promise<BarcodeProduct> {
    let response: Response;
    try {
      response = await this.fetcher(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,brands,image_front_url,nutriments,serving_quantity,serving_quantity_unit,categories_tags`,
        {
          headers: { 'User-Agent': 'FudCoach/1.0 (https://fud.coach)' },
          signal: AbortSignal.timeout(8000),
        }
      );
    } catch {
      throw new BarcodeError('unavailable');
    }
    if (!response.ok) throw new BarcodeError('unavailable');
    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new BarcodeError('unavailable');
    }
    if (data.status !== 1 || !data.product) throw new BarcodeError('not_found');
    const p = data.product;
    if (
      typeof p.code !== 'string' ||
      !/^\d{8,14}$/.test(p.code) ||
      p.code.padStart(14, '0') !== code.padStart(14, '0')
    )
      throw new BarcodeError('not_found');
    const n = p.nutriments ?? {};
    const values = [
      n['energy-kcal_100g'],
      n.proteins_100g,
      n.carbohydrates_100g,
      n.fat_100g,
    ];
    if (
      p.serving_quantity_unit === 'ml' ||
      (Array.isArray(p.categories_tags) &&
        p.categories_tags.includes('en:beverages')) ||
      typeof p.product_name !== 'string' ||
      !p.product_name.trim() ||
      values.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0) ||
      values[0] > 900 ||
      values.slice(1).some(v => v > 100)
    )
      throw new BarcodeError('incomplete');
    const serving = Number(p.serving_quantity);
    const product = {
      barcode: code,
      name: p.product_name.trim().slice(0, 200),
      brand: typeof p.brands === 'string' ? p.brands.trim().slice(0, 100) : '',
      imageUrl:
        typeof p.image_front_url === 'string' &&
        /^https:\/\//.test(p.image_front_url)
          ? p.image_front_url
          : undefined,
      per100g: {
        calories: values[0],
        protein: values[1],
        carbs: values[2],
        fat: values[3],
      },
      servingGrams:
        p.serving_quantity_unit === 'g' &&
        Number.isFinite(serving) &&
        serving > 0 &&
        serving <= 10000
          ? serving
          : undefined,
      retrievedAt: new Date().toISOString(),
    };
    const version = createHash('sha256')
      .update(JSON.stringify({ ...product, retrievedAt: undefined }))
      .digest('hex');
    return { ...product, version };
  }

  meal(product: BarcodeProduct, grams: number): AiFoodLogPayload {
    if (!Number.isFinite(grams) || grams <= 0 || grams > 10000)
      throw new BarcodeError('invalid');
    const round = (v: number) => Math.round(v * 100) / 100;
    const scale = grams / 100;
    return {
      name: [product.brand, product.name].filter(Boolean).join(' - '),
      quantity: 1,
      serving_size: `${round(grams)} g`,
      calories: Math.round(product.per100g.calories * scale),
      protein: round(product.per100g.protein * scale),
      carbs: round(product.per100g.carbs * scale),
      fat: round(product.per100g.fat * scale),
      nutrition: {
        source: 'open_food_facts',
        barcode: product.barcode,
        description: product.name,
        brand: product.brand,
        grams: round(grams),
        quantitySource: 'user',
        originalAmount: grams,
        originalUnit: 'g',
        per100g: product.per100g,
        retrievedAt: product.retrievedAt,
        assumptions: [],
      },
    };
  }
}
