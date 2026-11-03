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

export interface NutritionProvenance {
  source: 'usda';
  fdcId: number;
  description: string;
  dataType: string;
  grams: number;
  quantitySource: 'user' | 'usda_portion' | 'ai_estimate';
  portionId?: string;
  originalAmount: number | null;
  originalUnit: string;
  per100g: NutritionValues;
  retrievedAt: string;
  assumptions: string[];
}
