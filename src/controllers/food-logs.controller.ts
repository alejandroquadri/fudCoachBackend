import { ObjectId } from 'mongodb';
import { FoodLogsModel } from '../models';
import { AiFoodLogPayload, FoodLog } from '../types';
import { format } from 'date-fns';

export class FoodLogsController {
  foodLogsModel: FoodLogsModel = new FoodLogsModel();

  async getFoodLogsByDate(userId: string, date: string): Promise<FoodLog[]> {
    try {
      return this.foodLogsModel.getFoodLogsByDate(userId, date);
    } catch (error) {
      console.error('Error in ctrl getting food logs:', error);
      throw error;
    }
  }

  async createFoodLog(foodLog: FoodLog): Promise<{
    acknowledged: boolean;
    insertedId: ObjectId;
  }> {
    try {
      return this.foodLogsModel.createFoodLog(foodLog);
    } catch (error) {
      throw new Error('Error creating food log');
    }
  }

  async createAiFoodLog(
    aiFoodLogs: AiFoodLogPayload[],
    userId: string
  ): Promise<
    {
      acknowledged: boolean;
      insertedId: ObjectId;
    }[]
  > {
    try {
      return Promise.all(
        aiFoodLogs.map(aiFoodLog => {
          const foodLog: FoodLog = {
            user_id: userId,
            foodObj: {
              foodName: aiFoodLog.name,
              servings: aiFoodLog.quantity,
              size: aiFoodLog.serving_size,
              calories: aiFoodLog.calories,
              carbohydrates: aiFoodLog.carbs,
              proteins: aiFoodLog.protein,
              fats: aiFoodLog.fat,
            },
          };
          return this.foodLogsModel.createFoodLog(foodLog);
        })
      );
    } catch (error) {
      throw new Error('Error creating ai food log');
    }
  }

  async editFoodLog(foodLog: FoodLog): Promise<unknown> {
    try {
      if (!foodLog._id) {
        throw new Error('FoodLog must have an _id to be updated');
      }
      return this.foodLogsModel.editFoodLog(foodLog);
    } catch (error) {
      throw new Error('Error editing food log');
    }
  }

  async deleteLog(id: string): Promise<unknown> {
    try {
      return this.foodLogsModel.deleteFoodLog(id);
    } catch (error) {
      throw new Error('Error deleting food log');
    }
  }
}
