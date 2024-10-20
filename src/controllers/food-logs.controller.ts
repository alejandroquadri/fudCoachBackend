import { ObjectId } from 'mongodb';
import { FoodLogsModel } from '../models';
import { FoodLog } from '../types';

export class FoodLogsController {
  foodLogsModel: FoodLogsModel;

  constructor() {
    this.foodLogsModel = new FoodLogsModel();
  }

  getFoodLogsByDate = async (
    userId: string,
    date: string
  ): Promise<FoodLog[]> => {
    try {
      return this.foodLogsModel.getFoodLogsByDate(userId, date);
    } catch (error) {
      console.error('Error in ctrl getting food logs:', error);
      throw error;
    }
  };

  createFoodLog = async (
    foodLog: FoodLog
  ): Promise<{
    acknowledged: boolean;
    insertedId: ObjectId;
  }> => {
    try {
      return this.foodLogsModel.createFoodLog(foodLog);
    } catch (error) {
      throw new Error('Error creating food log');
    }
  };

  editFoodLog = async (foodLog: FoodLog): Promise<unknown> => {
    try {
      if (!foodLog._id) {
        throw new Error('FoodLog must have an _id to be updated');
      }
      return this.foodLogsModel.editFoodLog(foodLog);
    } catch (error) {
      throw new Error('Error editing food log');
    }
  };

  deleteLog = async (id: string): Promise<unknown> => {
    try {
      return this.foodLogsModel.deleteFoodLog(id);
    } catch (error) {
      throw new Error('Error deleting food log');
    }
  };
}
