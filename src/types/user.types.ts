import { ObjectId } from 'mongodb';

export interface UserProfile {
  _id?: ObjectId | string;
  name: string;
  avatar?: string;
  email: string;
  password: string;
  gender: string;
  lifeStyle: number;
  activityLevel: string;
  triedOtherApps: boolean;
  unitType: 'metric' | 'imperial';
  initWeight: number; // esto siempre lo voy a guardar en kg
  height: number; // esto siempre lo voy a guardar en cm
  birthdate: string; // un string del tipo YYYY-MM-DD
  goal: string; // perder peso: 0 | ganar peso: 1 | mantenerme: 2
  weightGoal: number; // siempre en kg
  goalVelocity: number; // perdida de peso por semana en kg
  goalObstacle: string; // que te impide alcanzar tus metas
  dietType: string; // tipo de dieta: clasico | vegano | vegetariano | paleo | etc
  outcome: string; // ser mas saludabe | tener mas energia | etc
  nutritionGoals: NutritionGoals;
  dietaryRestrictions?: Array<string>;
  allergies?: Array<string>;
  dislikes?: Array<string>;
  likes?: Array<string>;
  meal_times?: Array<string>;
}

export interface NutritionGoals {
  tdee: number;
  bmr: number;
  dailyCaloricTarget: number;
  dailyCarbsTarget: number;
  dailyProteinTarget: number;
  dailyFatTarget: number;
}

export interface OnboardingState extends UserProfile {
  onboardingStep: number;
}

export type AiProfile = Omit<UserProfile, '_id' | 'email' | 'password'>;

// export interface User {
//   _id?: ObjectId | string;
//   email: string;
//   name: string;
//   password: string;
//   weightLogs: Array<{ weightLog: number; date: Date }>;
//   weightUnit: string;
//   height: number;
//   heightUnit: string;
//   birthday: Date;
//   sex: string;
//   bmr: number;
//   tdee: number;
//   dailyCaloricTarget: number;
//   dailyFatTarget: number;
//   dailyCarbsTarget: number;
//   dailyProteinTarget: number;
//   completedQA: boolean;
//   nickName?: string;
//   qAndAnswers?: Array<string>;
// }
//
// export type UserWithoutId = Omit<User, '_id'>;
//
// export interface RegistrationData {
//   name: string;
//   email: string;
//   password: string;
//   birthdate: Date;
//   weight: number;
//   weightUnit: string;
//   height: number;
//   heightUnit: string;
//   sex: string;
//   lifestyle: number;
//   weightGoal: number;
// }
//
// export interface TargetObj {
//   bmr: number;
//   tdee: number;
//   dailyCaloricTarget: number;
//   dailyFatTarget: number;
//   dailyCarbsTarget: number;
//   dailyProteinTarget: number;
// }
//
// export interface AiUserPreferences {
//   name: string;
//   favorite_foods: Array<string>;
//   hated_foods: Array<string>;
//   birthdate: string;
//   diet_type: string;
//   usual_breakfast: string;
//   usual_lunch: string;
//   usual_dinner: string;
//   usual_snack: string;
// }
