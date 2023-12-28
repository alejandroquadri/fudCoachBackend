import { ObjectId } from 'mongodb';

export interface FoodLog {
  _id: string;
  user_id: string | ObjectId;
  date: Date;
  dateString: string;
  hour: string;
  foodObj: {
    foodName: string;
    servings: string;
    size: string;
    calories: number;
    carbohydrates: number;
    proteins: number;
    fats: number;
  };
}
