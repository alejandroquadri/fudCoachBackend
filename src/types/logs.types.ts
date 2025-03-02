import { ObjectId } from 'mongodb';

export interface FoodLog {
  _id?: ObjectId;
  user_id: string | ObjectId;
  createdAt?: Date; // timestamp when log was created
  updatedAt?: Date; // timestamp when log was updated
  date: string; // date the food was consumed
  hour: string; // hour the food was consumed
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
  date: string;
  hour: string;
  exerciseName: string;
  duration: number;
  caloriesBurned: number;
}

export interface AiFoodLog {
  name: string;
  quantity: number;
  serving_size: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
