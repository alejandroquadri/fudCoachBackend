import { z } from 'zod';

export const RouteSchema = z.object({
  route: z.enum([
    'ADVICE',
    'LOG_WEIGHT',
    'LOG_MEAL',
    'EXERCISE_LOG',
    'PREFERENCES',
    'UNKNOWN',
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

export const MealItemSchema = z.object({
  name: z.string().min(1).max(160),
  searchQuery: z.string().min(1).max(200),
  brand: z.string().nullable(),
  preparation: z.string().nullable(),
  amount: z.number().positive().nullable(),
  unit: z.enum([
    'g',
    'kg',
    'oz',
    'lb',
    'ml',
    'cup',
    'tbsp',
    'tsp',
    'piece',
    'slice',
    'serving',
  ]),
  portionDescription: z.string().max(160),
  estimatedGrams: z.number().positive().max(10000).nullable(),
  quantityEstimated: z.boolean(),
  serving_size: z.enum(['small', 'medium', 'large']),
});

export const MealAnalysisSchema = z.object({
  outcome: z.enum(['meal', 'clarify', 'no_food', 'cancel']),
  items: z.array(MealItemSchema).max(10),
  question: z.string().nullable(),
});

export const PendingMealSchema = z.object({
  items: z.array(MealItemSchema).max(10),
  question: z.string(),
});

export const FoodMatchesSchema = z.object({
  matches: z
    .array(
      z.object({
        itemIndex: z.number().int().nonnegative(),
        fdcId: z.number().int().positive().nullable(),
        question: z.string().nullable(),
      })
    )
    .max(10),
});

export const WeightSchema = z.object({
  weight: z.number().positive().max(700),
});
export const ExerciseSchema = z.object({
  exerciseName: z.string().min(1),
  duration: z.number().int().positive().max(1440),
  caloriesBurned: z.number().int().nonnegative(),
});
const PreferenceListChangeSchema = z.object({
  operation: z.enum(['add', 'remove', 'replace']),
  values: z.array(z.string()),
});
export const PreferenceChangeSchema = z.object({
  name: z.string().nullable(),
  likes: PreferenceListChangeSchema.nullable(),
  dislikes: PreferenceListChangeSchema.nullable(),
});

export type MealItem = z.infer<typeof MealItemSchema>;
export type MealAnalysis = z.infer<typeof MealAnalysisSchema>;
export type PendingMeal = z.infer<typeof PendingMealSchema>;
