import { ObjectId, OptionalId } from 'mongodb';
import { FoodLog } from '../types';
import { MongoService } from '../services';

export class FoodLogsModel {
  collectionName = 'foodLogs';
  mongoSc: MongoService<FoodLog>;
  constructor() {
    this.mongoSc = new MongoService<FoodLog>('foodLogs');
  }

  async createFoodLog(foodLog: OptionalId<FoodLog>) {
    if (typeof foodLog._id === 'string') {
      foodLog._id = new ObjectId(foodLog._id);
    }
    if (typeof foodLog.user_id === 'string') {
      foodLog.user_id = new ObjectId(foodLog.user_id);
    }
    return this.mongoSc.create(foodLog);
  }

  async editFoodLog(foodLog: FoodLog) {
    // Ensure the food log has a valid _id
    if (!foodLog._id) {
      throw new Error('FoodLog must have an _id to be updated');
    }

    // Remove _id from the update object to avoid trying to update it
    const { _id, user_id, ...updateData } = foodLog;

    return this.mongoSc.update(_id, updateData);
  }

  async deleteFoodLog(id: string | ObjectId) {
    // Ensure the id is an ObjectId
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;

    try {
      const result = await this.mongoSc.delete(objectId);
      if (result.deletedCount === 1) {
        console.log(`Successfully deleted food log with id: ${id}`);
        return { success: true, message: `Food log with id ${id} deleted` };
      } else {
        console.log(`No food log found with id: ${id}`);
        return { success: false, message: `No food log found with id ${id}` };
      }
    } catch (error) {
      console.error('Error deleting food log:', error);
      return {
        success: false,
        message: 'Error occurred while deleting food log',
        error,
      };
    }
  }

  async getFoodLogsByDate(
    userId: string | ObjectId,
    date: string
  ): Promise<FoodLog[]> {
    try {
      userId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      const query = {
        user_id: userId,
        date,
      };

      return this.mongoSc.find(query, { sort: { date: 1 } });
    } catch (error) {
      console.error('Error getting food logs:', error);
      throw error;
    }
  }
}
