import { FoodLogsModel } from '../models';
import { FoodLog } from '../types';

export class FoodLogsController {
  foodLogsModel: FoodLogsModel;

  constructor() {
    this.foodLogsModel = new FoodLogsModel();
  }

  getFoodLogsByDate = async (
    userId: string,
    date: Date
  ): Promise<FoodLog[]> => {
    try {
      return this.foodLogsModel.getFoodLogsByDate(userId, date);
    } catch (error) {
      console.error('Error in ctrl getting food logs:', error);
      throw error;
    }
  };
}
