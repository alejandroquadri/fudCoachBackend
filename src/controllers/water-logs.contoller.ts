import { ObjectId } from 'mongodb';
import { WaterLogsModel } from '../models';
import { WaterLog } from '../types';

export class WaterLogsController {
  waterLogsModel: WaterLogsModel;

  constructor() {
    this.waterLogsModel = new WaterLogsModel();
  }

  getWaterLogsByDate = async (
    userId: string,
    date: string
  ): Promise<WaterLog[]> => {
    try {
      return this.waterLogsModel.getWaterLogsByDate(userId, date);
    } catch (error) {
      console.error('Error in ctrl getting water logs:', error);
      throw error;
    }
  };

  createWaterLog = async (
    waterLog: WaterLog
  ): Promise<{
    acknowledged: boolean;
    insertedId: ObjectId;
  }> => {
    try {
      return this.waterLogsModel.createWaterLog(waterLog);
    } catch (error) {
      throw new Error('Error creating water log');
    }
  };

  editWaterLog = async (waterLog: WaterLog) => {
    // Ensure the water log has a valid _id
    try {
      if (!waterLog._id) {
        throw new Error('WaterLog must have an _id to be updated');
      }
      return this.waterLogsModel.editWaterLog(waterLog);
    } catch (error) {
      throw new Error('Error updating water log');
    }
  };

  deleteWaterLog = async (id: string | ObjectId) => {
    // Ensure the id is an ObjectId
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    return this.waterLogsModel.deleteWaterLog(objectId);
  };
}
