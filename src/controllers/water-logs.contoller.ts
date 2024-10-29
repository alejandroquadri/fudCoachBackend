import { ObjectId } from 'mongodb';
import { WaterLogsModel } from '../models';
import { WaterLog } from '../types';

export class WaterLogsController {
  waterLogsModel: WaterLogsModel;

  constructor() {
    this.waterLogsModel = new WaterLogsModel();
  }

  getWaterLogByDate = async (
    userId: string,
    date: string
  ): Promise<WaterLog | null> => {
    try {
      return this.waterLogsModel.getWaterLogByDate(userId, date);
    } catch (error) {
      console.error('Error in ctrl getting water logs:', error);
      throw error;
    }
  };

  upsertWaterLog = async (waterLog: WaterLog) => {
    try {
      return this.waterLogsModel.upsertWaterLog(waterLog);
    } catch (error) {
      throw new Error('Error creating water log');
    }
  };

  deleteWaterLog = async (id: string | ObjectId) => {
    // Ensure the id is an ObjectId
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    return this.waterLogsModel.deleteWaterLog(objectId);
  };
}
