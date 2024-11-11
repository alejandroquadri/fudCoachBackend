import { WeightLogsModel } from '../models';
import { WeightLogInterface } from '../types';

export class WeightLogsController {
  weightLogsModel: WeightLogsModel = new WeightLogsModel();

  createWeightLog = async (weightLog: WeightLogInterface) => {
    try {
      return this.weightLogsModel.createWeightLog(weightLog);
    } catch (error) {
      throw new Error('Error creating weight log');
    }
  };

  getWeightLog = async (userId: string) => {
    try {
      return this.weightLogsModel.getWeightLog(userId);
    } catch (error) {
      console.error('Error in ctrl getting weight logs:', error);
      throw error;
    }
  };

  editWeightLog = async (weightLog: WeightLogInterface) => {
    try {
      return this.weightLogsModel.editWeightLog(weightLog);
    } catch (error) {
      throw new Error('Error editing weight log');
    }
  };

  deleteWeightLog = async (id: string) => {
    try {
      return this.weightLogsModel.deleteWeightLog(id);
    } catch (error) {
      throw new Error('Error deleting weight log');
    }
  };
}
