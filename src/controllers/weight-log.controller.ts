import { format } from 'date-fns';
import { WeightLogsModel } from '../models';
import { WeightLogInterface } from '../types';

export class WeightLogsController {
  weightLogsModel: WeightLogsModel = new WeightLogsModel();

  createWeightLog(weightLog: WeightLogInterface) {
    try {
      return this.weightLogsModel.createWeightLog(weightLog);
    } catch (error) {
      throw new Error('Error creating weight log');
    }
  }

  createAiWeightLog(weight: number, userId: string) {
    try {
      const weightLog: WeightLogInterface = {
        user_id: userId,
        date: format(new Date(), 'yyyy-MM-dd'),
        weightLog: weight,
      };
      return this.weightLogsModel.createWeightLog(weightLog);
    } catch (error) {
      throw new Error('Error creating weight log');
    }
  }

  getWeightLog(userId: string) {
    try {
      return this.weightLogsModel.getWeightLog(userId);
    } catch (error) {
      console.error('Error in ctrl getting weight logs:', error);
      throw error;
    }
  }

  editWeightLog(weightLog: WeightLogInterface) {
    try {
      return this.weightLogsModel.editWeightLog(weightLog);
    } catch (error) {
      throw new Error('Error editing weight log');
    }
  }

  deleteWeightLog(id: string) {
    try {
      return this.weightLogsModel.deleteWeightLog(id);
    } catch (error) {
      throw new Error('Error deleting weight log');
    }
  }
}
