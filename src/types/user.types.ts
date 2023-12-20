export interface User {
  _id: string;
  email: string;
  name: string;
  password: string;
  weightLogs: Array<{ weightLog: number; date: Date }>;
  weightUnit: string;
  height: string;
  heightUnit: string;
  birthday: string;
  gender: string;
  completedQA: boolean;
  nickName?: string;
  qAndAnswers?: Array<string>;
}

export type newProfile = {
  name: string;
  birthdate: Date;
  weight: string;
  height: string;
  weightUnit: string;
  heightUnit: string;
  gender: string;
};
