import { languageInstruction, Language } from './language';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AiFoodLogPayload } from '../../types/logs.types';
import { UsdaFood, UsdaFoodCandidate } from '../../types/nutrition.types';
import { UsdaService, UsdaError } from '../usda.service';
import { AiCallContext, AiModelService } from './ai-model.service';
import { FoodMatchesSchema, MealItem } from './ai-schemas';
import { FOOD_MATCH_PROMPT } from './ai-prompts';

export type MealNutritionResult =
  | { outcome: 'ready'; meals: AiFoodLogPayload[] }
  | { outcome: 'clarify'; question: string };
export interface FoodCatalog {
  search(
    query: string,
    branded?: boolean,
    signal?: AbortSignal
  ): Promise<UsdaFoodCandidate[]>;
  getFood(fdcId: number, signal?: AbortSignal): Promise<UsdaFood>;
}

const words = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/);
const unitWords: Record<string, string[]> = {
  cup: ['cup', 'cups'],
  tbsp: ['tablespoon', 'tablespoons', 'tbsp'],
  tsp: ['teaspoon', 'teaspoons', 'tsp'],
  piece: ['piece', 'pieces', 'whole'],
  slice: ['slice', 'slices'],
  serving: ['serving', 'servings'],
  ml: ['ml', 'milliliter', 'milliliters'],
};

export function mealGrams(
  item: MealItem,
  food: UsdaFood
): {
  grams: number;
  source: 'user' | 'usda_portion' | 'ai_estimate';
  portionId?: string;
} | null {
  const factor: Record<string, number> = {
    g: 1,
    kg: 1000,
    oz: 28.349523125,
    lb: 453.59237,
  };
  if (item.amount !== null && factor[item.unit]) {
    return {
      grams: item.amount * factor[item.unit],
      source: item.quantityEstimated ? 'ai_estimate' : 'user',
    };
  }
  if (item.amount !== null) {
    const aliases = unitWords[item.unit] ?? [];
    const expectedSize = words(item.portionDescription).find(word =>
      ['small', 'medium', 'large'].includes(word)
    );
    const candidates = food.portions.filter(portion => {
      const tokens = words(portion.description);
      const unitMatches =
        aliases.some(alias => tokens.includes(alias)) ||
        (item.unit === 'piece' &&
          tokens.some(token => ['small', 'medium', 'large'].includes(token)));
      return unitMatches && (!expectedSize || tokens.includes(expectedSize));
    });
    // Different gram weights for the same household unit are ambiguous; don't pick the first.
    if (candidates.length) {
      const perUnit = candidates.map(portion => portion.grams / portion.amount);
      if (perUnit.every(value => Math.abs(value - perUnit[0]) < 0.1)) {
        return {
          grams: item.amount * perUnit[0],
          source: item.quantityEstimated ? 'ai_estimate' : 'usda_portion',
          portionId: candidates[0].id,
        };
      }
    }
  }
  // No assumed milliliters-to-grams conversion: density depends on the food.
  return item.estimatedGrams === null
    ? null
    : { grams: item.estimatedGrams, source: 'ai_estimate' };
}

export function calculateMeal(
  item: MealItem,
  food: UsdaFood
): AiFoodLogPayload | null {
  const quantity = mealGrams(item, food);
  if (
    !quantity ||
    !Number.isFinite(quantity.grams) ||
    quantity.grams <= 0 ||
    quantity.grams > 10000
  )
    return null;
  const scale = quantity.grams / 100;
  const round = (value: number) => Math.round(value * 100) / 100;
  const byWeight = ['g', 'kg', 'oz', 'lb', 'ml'].includes(item.unit);
  return {
    name: item.name,
    quantity: byWeight ? 1 : item.amount ?? 1,
    serving_size: item.serving_size,
    calories: Math.round(food.per100g.calories * scale),
    protein: round(food.per100g.protein * scale),
    carbs: round(food.per100g.carbs * scale),
    fat: round(food.per100g.fat * scale),
    nutrition: {
      source: 'usda',
      fdcId: food.fdcId,
      description: food.description,
      dataType: food.dataType,
      grams: round(quantity.grams),
      quantitySource: quantity.source,
      portionId: quantity.portionId,
      originalAmount: item.amount,
      originalUnit: item.unit,
      per100g: { ...food.per100g },
      retrievedAt: food.retrievedAt,
      assumptions:
        quantity.source === 'ai_estimate'
          ? [`Estimated portion: approximately ${round(quantity.grams)} g.`]
          : [],
    },
  };
}

export class MealNutritionService {
  constructor(
    private readonly models: Pick<AiModelService, 'structured'>,
    private readonly catalog: FoodCatalog = new UsdaService()
  ) {}

  async resolve(
    items: MealItem[],
    context: AiCallContext,
    language?: Language | null
  ): Promise<MealNutritionResult> {
    if (!items.length)
      return {
        outcome: 'clarify',
        question: 'What foods and approximate amounts would you like to log?',
      };
    if (Date.now() >= context.deadline) throw new UsdaError('unavailable');
    const signal = AbortSignal.timeout(
      Math.max(1, context.deadline - Date.now())
    );
    const searches: Array<{
      itemIndex: number;
      item: MealItem;
      candidates: UsdaFoodCandidate[];
    }> = [];
    // Limit concurrency and stop immediately on rate-limit or configuration errors.
    for (let index = 0; index < items.length; index++) {
      const candidates = await this.catalog.search(
        items[index].searchQuery,
        Boolean(items[index].brand),
        signal
      );
      if (!candidates.length) return this.unmatched(items[index]);
      searches.push({ itemIndex: index, item: items[index], candidates });
    }
    const selection = await this.models.structured(
      'food_match',
      FoodMatchesSchema,
      [
        new SystemMessage(FOOD_MATCH_PROMPT + languageInstruction(language)),
        new HumanMessage(JSON.stringify(searches)),
      ],
      context
    );
    if (
      selection.matches.length !== items.length ||
      new Set(selection.matches.map(match => match.itemIndex)).size !==
        items.length
    ) {
      return {
        outcome: 'clarify',
        question:
          'Could you describe the foods and how they were prepared more specifically?',
      };
    }
    const meals: AiFoodLogPayload[] = [];
    for (const search of searches) {
      const match = selection.matches.find(
        result => result.itemIndex === search.itemIndex
      );
      if (!match || match.fdcId === null)
        return this.unmatched(search.item, match?.question);
      const candidate = search.candidates.find(
        food => food.fdcId === match.fdcId
      );
      // Treat identifiers returned by the model as untrusted, even if its JSON is valid.
      if (!candidate || !this.compatiblePreparation(search.item, candidate))
        return this.unmatched(search.item);
      let food: UsdaFood;
      try {
        food = await this.catalog.getFood(candidate.fdcId, signal);
      } catch (error) {
        if (error instanceof UsdaError && error.code === 'invalid_food')
          return this.unmatched(search.item);
        throw error;
      }
      if (food.fdcId !== candidate.fdcId) throw new UsdaError('invalid_food');
      const meal = calculateMeal(search.item, food);
      if (!meal)
        return {
          outcome: 'clarify',
          question: `Approximately how much ${search.item.name} did you have? A weight in grams or a household portion would help.`,
        };
      meals.push(meal);
    }
    // All items must resolve before the caller commits any meal logs.
    return { outcome: 'ready', meals };
  }

  private compatiblePreparation(item: MealItem, candidate: UsdaFoodCandidate) {
    const wanted = words(`${item.preparation ?? ''} ${item.searchQuery}`);
    const found = words(candidate.description);
    if (
      wanted.includes('raw') &&
      found.some(word =>
        ['cooked', 'roasted', 'fried', 'grilled', 'boiled'].includes(word)
      )
    )
      return false;
    if (
      wanted.some(word =>
        ['cooked', 'roasted', 'fried', 'grilled', 'boiled'].includes(word)
      ) &&
      found.includes('raw')
    )
      return false;
    if (found.includes('breaded') && !wanted.includes('breaded')) return false;
    if (item.brand) {
      const brandWords = words(item.brand);
      const candidateWords = words(
        `${candidate.brand ?? ''} ${candidate.description}`
      );
      if (!brandWords.every(word => candidateWords.includes(word)))
        return false;
    }
    return true;
  }

  private unmatched(
    item: MealItem,
    question?: string | null
  ): MealNutritionResult {
    return {
      outcome: 'clarify',
      question:
        question?.trim() ||
        `I couldn't find a reliable food match for ${item.name}. Could you specify the brand, ingredients, or preparation?`,
    };
  }
}
