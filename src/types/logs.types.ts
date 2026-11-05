import { ObjectId } from 'mongodb';
import { NutritionProvenance } from './nutrition.types';

export interface FoodLog {
  _id?: ObjectId;
  user_id: string | ObjectId;
  createdAt?: Date; // timestamp when log was created
  updatedAt?: Date; // timestamp when log was updated
  // Items from one coach operation share this ID. The local timestamp records
  // when the entry was made, not necessarily when the food was eaten.
  mealGroupId?: string;
  loggedLocalDateTime?: string;
  loggedTimeZone?: string;
  loggedTimeZoneSource?: 'notification_settings' | 'device';
  nutrition?: NutritionProvenance;
  foodObj: {
    foodName: string;
    servings: number;
    size: string;
    calories: number;
    carbohydrates: number;
    proteins: number;
    fats: number;
  };
}

export interface WaterLog {
  _id?: ObjectId | string;
  user_id: string | ObjectId;
  createdAt?: Date; // timestamp when log was created
  updatedAt?: Date; // timestamp when log was updated
  date: string;

  waterCups: number;
}

export interface ExerciseLog {
  _id?: ObjectId | string;
  user_id: string | ObjectId;
  createdAt?: Date; // timestamp when log was created
  updatedAt?: Date; // timestamp when log was updated
  // date: string;
  // hour: string;
  exerciseName: string;
  duration: number;
  caloriesBurned: number;
}

export interface AiFoodLogPayload {
  name: string;
  quantity: number;
  serving_size: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  nutrition?: NutritionProvenance;
}

export interface AiExerciseLogPayload {
  exerciseName: string;
  duration: number;
  caloriesBurned: number;
}
