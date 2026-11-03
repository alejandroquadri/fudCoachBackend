import { z } from 'zod';
import {
  NutritionValues,
  UsdaFood,
  UsdaFoodCandidate,
  UsdaPortion,
} from '../types/nutrition.types';

const CandidateSchema = z.object({
  fdcId: z.number().int().positive(),
  description: z.string(),
  dataType: z.string(),
  brandOwner: z.string().optional(),
  brandName: z.string().optional(),
});
const SearchSchema = z.object({ foods: z.array(CandidateSchema) });
const DetailSchema = CandidateSchema.extend({
  foodNutrients: z.array(
    z.object({
      nutrient: z.object({ id: z.number(), unitName: z.string() }),
      amount: z.number().optional(),
    })
  ),
  foodPortions: z
    .array(
      z.object({
        id: z.number().optional(),
        gramWeight: z.number(),
        amount: z.number().optional(),
        modifier: z.string().optional(),
        portionDescription: z.string().optional(),
        measureUnit: z
          .object({ name: z.string(), abbreviation: z.string().optional() })
          .optional(),
      })
    )
    .optional(),
  servingSize: z.number().optional(),
  servingSizeUnit: z.string().optional(),
  householdServingFullText: z.string().optional(),
});

export class UsdaError extends Error {
  constructor(
    public readonly code:
      | 'configuration'
      | 'rate_limit'
      | 'unavailable'
      | 'invalid_food'
  ) {
    super(`USDA food lookup failed (${code})`);
  }
}

export function normalizeUsdaFood(input: unknown, now = new Date()): UsdaFood {
  const result = DetailSchema.safeParse(input);
  if (!result.success) throw new UsdaError('invalid_food');
  const food = result.data;
  const nutrient = (ids: number[], expectedUnit: string): number => {
    for (const id of ids) {
      const entry = food.foodNutrients.find(
        item => item.nutrient.id === id && item.amount !== undefined
      );
      if (
        !entry ||
        entry.amount === undefined ||
        !Number.isFinite(entry.amount) ||
        entry.amount < 0
      )
        continue;
      const unit = entry.nutrient.unitName.toLowerCase();
      if (unit === expectedUnit) return entry.amount;
      if (expectedUnit === 'g' && unit === 'mg') return entry.amount / 1000;
      if (expectedUnit === 'kcal' && unit === 'kj') return entry.amount / 4.184;
    }
    // Missing nutrients are not zero. Incomplete records must not become valid logs.
    throw new UsdaError('invalid_food');
  };
  const per100g: NutritionValues = {
    calories: nutrient([1008, 2048, 2047, 1062], 'kcal'),
    protein: nutrient([1003], 'g'),
    carbs: nutrient([1005], 'g'),
    fat: nutrient([1004], 'g'),
  };
  const portions: UsdaPortion[] = (food.foodPortions ?? []).flatMap(portion => {
    const amount = portion.amount ?? 1;
    if (!(portion.gramWeight > 0) || !(amount > 0)) return [];
    const measure =
      portion.measureUnit?.name === 'undetermined'
        ? ''
        : portion.measureUnit?.name;
    return [
      {
        id: String(portion.id ?? ''),
        amount,
        grams: portion.gramWeight,
        description: [portion.portionDescription, portion.modifier, measure]
          .filter(Boolean)
          .join(' '),
      },
    ];
  });
  const servingUnit = food.servingSizeUnit?.toLowerCase();
  if (
    food.servingSize &&
    food.servingSize > 0 &&
    ['g', 'grm', 'gram', 'grams'].includes(servingUnit ?? '')
  ) {
    portions.push({
      id: 'label-serving',
      amount: 1,
      grams: food.servingSize,
      description: `serving ${food.householdServingFullText ?? ''}`.trim(),
    });
  }
  return {
    fdcId: food.fdcId,
    description: food.description,
    dataType: food.dataType,
    brand: food.brandName || food.brandOwner,
    per100g,
    portions,
    retrievedAt: now.toISOString(),
  };
}

type CacheEntry = { value: unknown; expiresAt: number };

export class UsdaService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private blockedUntil = 0;

  constructor(
    private readonly apiKey: () => string | undefined = () =>
      process.env.USDA_API_KEY,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async search(
    query: string,
    branded = false,
    signal?: AbortSignal
  ): Promise<UsdaFoodCandidate[]> {
    const normalized = query.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!normalized) return [];
    const key = `search:${branded}:${normalized.toLowerCase()}`;
    return this.cached(key, 60 * 60 * 1000, async () => {
      const response = await this.request(
        '/foods/search',
        {
          query: normalized,
          pageSize: 8,
          pageNumber: 1,
          dataType: branded
            ? ['Branded']
            : ['Foundation', 'SR Legacy', 'Survey (FNDDS)'],
        },
        signal
      );
      const parsed = SearchSchema.safeParse(response);
      if (!parsed.success) throw new UsdaError('invalid_food');
      return parsed.data.foods.map(food => ({
        fdcId: food.fdcId,
        description: food.description,
        dataType: food.dataType,
        brand: food.brandName || food.brandOwner,
      }));
    });
  }

  async getFood(fdcId: number, signal?: AbortSignal): Promise<UsdaFood> {
    if (!Number.isSafeInteger(fdcId) || fdcId <= 0)
      throw new UsdaError('invalid_food');
    return this.cached(`food:${fdcId}`, 24 * 60 * 60 * 1000, async () =>
      normalizeUsdaFood(await this.request(`/food/${fdcId}`, undefined, signal))
    );
  }

  private async cached<T>(
    key: string,
    ttl: number,
    loader: () => Promise<T>
  ): Promise<T> {
    const existing = this.cache.get(key);
    if (existing && existing.expiresAt > Date.now()) return existing.value as T;
    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;
    const promise = loader()
      .then(value => {
        this.cache.delete(key);
        if (this.cache.size >= 500)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { value, expiresAt: Date.now() + ttl });
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private async request(
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<unknown> {
    const key = this.apiKey()?.trim();
    if (!key) throw new UsdaError('configuration');
    if (Date.now() < this.blockedUntil) throw new UsdaError('rate_limit');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (signal?.aborted) throw new UsdaError('unavailable');
        const response = await this.fetcher(
          `https://api.nal.usda.gov/fdc/v1${path}`,
          {
            method: body ? 'POST' : 'GET',
            headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
            signal: signal
              ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
              : AbortSignal.timeout(8000),
          }
        );
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('retry-after'));
          this.blockedUntil =
            Date.now() +
            (retryAfter > 0 ? Math.min(retryAfter, 3600) : 3600) * 1000;
          throw new UsdaError('rate_limit');
        }
        if ([401, 403].includes(response.status))
          throw new UsdaError('configuration');
        if (response.status === 404) throw new UsdaError('invalid_food');
        if (!response.ok) throw new UsdaError('unavailable');
        return await response.json();
      } catch (error) {
        const safeError =
          error instanceof UsdaError ? error : new UsdaError('unavailable');
        if (
          safeError.code !== 'unavailable' ||
          attempt === 1 ||
          signal?.aborted
        )
          throw safeError;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    throw new UsdaError('unavailable');
  }
}
