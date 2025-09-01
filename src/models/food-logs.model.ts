import { addDays, format, parseISO } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { ObjectId, OptionalId } from 'mongodb';
import { MongoService } from '../services';
import { FoodLog } from '../types';
const TZ = 'America/Argentina/Buenos_Aires';

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
    dateISO: string // "YYYY-MM-DD" in the user's local calendar
  ): Promise<FoodLog[]> {
    try {
      const objectId =
        typeof userId === 'string' ? new ObjectId(userId) : userId;

      // Build the next day's ISO string safely (no local/UTC ambiguity)
      const nextISO = format(addDays(parseISO(dateISO), 1), 'yyyy-MM-dd');

      // Convert local midnights to UTC instants for MongoDB
      const utcStart = fromZonedTime(`${dateISO}T00:00:00`, TZ);
      const utcEnd = fromZonedTime(`${nextISO}T00:00:00`, TZ);

      const query = {
        user_id: objectId,
        createdAt: { $gte: utcStart, $lt: utcEnd }, // half-open range
      };

      return this.mongoSc.find(query, { sort: { createdAt: 1 } });
    } catch (error) {
      console.error('Error getting food logs:', error);
      throw error;
    }
  }
}
