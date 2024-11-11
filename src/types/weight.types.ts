import { ObjectId } from 'mongodb';

export interface WeightLogInterface {
  _id?: ObjectId;
  user_id: string | ObjectId;
  createdAt?: Date; // timestamp when log was created
  updatedAt?: Date; // timestamp when log was updated
  date: string;
  weightLog: number;
}
