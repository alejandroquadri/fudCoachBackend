import { ObjectId } from 'mongodb';

export interface User {
  _id?: ObjectId | string;
  email: string;
  name: string;
  password: string;
  weightLogs: Array<{ weightLog: number; date: Date }>;
  weightUnit: string;
  height: number;
  heightUnit: string;
  birthday: Date;
  sex: string;
  bmr: number;
  tdee: number;
  dailyCaloricTarget: number;
  dailyFatTarget: number;
  dailyCarbsTarget: number;
  dailyProteinTarget: number;
  completedQA: boolean;
  nickName?: string;
  qAndAnswers?: Array<string>;
}

export type UserWithoutId = Omit<User, '_id'>;

export interface RegistrationData {
  name: string;
  email: string;
  password: string;
  birthdate: Date;
  weight: number;
  weightUnit: string;
  height: number;
  heightUnit: string;
  sex: string;
  lifestyle: number;
  weightGoal: number;
}

export interface TargetObj {
  bmr: number;
  tdee: number;
  dailyCaloricTarget: number;
  dailyFatTarget: number;
  dailyCarbsTarget: number;
  dailyProteinTarget: number;
}

export interface AiUserPreferences {
  name: string;
  favorite_foods: Array<string>;
  hated_foods: Array<string>;
  birthdate: string;
  diet_type: string;
  usual_breakfast: string;
  usual_lunch: string;
  usual_dinner: string;
  usual_snack: string;
}
