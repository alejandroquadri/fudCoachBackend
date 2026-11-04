export interface NutritionValues {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface UsdaFoodCandidate {
  fdcId: number;
  description: string;
  dataType: string;
  brand?: string;
}

export interface UsdaPortion {
  id: string;
  description: string;
  amount: number;
  grams: number;
}

export interface UsdaFood extends UsdaFoodCandidate {
  per100g: NutritionValues;
  portions: UsdaPortion[];
  retrievedAt: string;
}

interface NutritionBase {
  description: string;
  grams: number;
  quantitySource: 'user' | 'usda_portion' | 'ai_estimate';
  originalAmount: number | null;
  originalUnit: string;
  per100g: NutritionValues;
  retrievedAt: string;
  assumptions: string[];
}

export type NutritionProvenance = NutritionBase &
  (
    | {
        source: 'usda';
        fdcId: number;
        dataType: string;
        portionId?: string;
      }
    | { source: 'open_food_facts'; barcode: string; brand: string }
  );
