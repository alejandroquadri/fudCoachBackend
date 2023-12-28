import { mongoInstance } from '../connection';
import { ObjectId } from 'mongodb';
import { FoodLog } from '../types';

export class FoodLogsModel {
  collectionName = 'foodLogs';

  /**
   * Get foodLogs for a user and date
   * @param userId - The ID of the user
   * @param dateString - The date of the foodLogs as a string in 'YYYY-MM-DD' format
   * @returns Promise<FoodLog[]>
   */
  getFoodLogsByDate = async (
    userId: string | ObjectId,
    dateInput: Date
  ): Promise<FoodLog[]> => {
    try {
      // Ensure dateInput is a Date object
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format');
      }
      // Set to start of the day
      date.setHours(0, 0, 0, 0);

      // Create a new Date object for the end of the day
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      const query = {
        userId: new ObjectId(userId),
        date: {
          $gte: date, // Greater than or equal to the start of the day
          $lt: endDate, // Less than the end of the day
        },
      };
      return mongoInstance.db
        .collection<FoodLog>(this.collectionName)
        .find(query)
        .sort({ date: 1 })
        .toArray();
    } catch (error) {
      console.error('Error getting food logs:', error);
      throw error;
    }
  };
}
