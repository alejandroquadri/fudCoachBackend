import { ObjectId } from 'mongodb';
import { MongoService } from '../services';
import { WeightLogInterface } from '../types';

export class WeightLogsModel {
  collectionName = 'weightLogs';
  private mongoSc: MongoService<WeightLogInterface>;
  constructor() {
    this.mongoSc = new MongoService<WeightLogInterface>('weightLogs');
  }

  createWeightLog = async (weightLog: WeightLogInterface) => {
    if (typeof weightLog.user_id === 'string') {
      weightLog.user_id = new ObjectId(weightLog.user_id);
    }
    return this.mongoSc.create(weightLog);
  };

  getWeightLog = async (userId: string) => {
    const query = { user_id: new ObjectId(userId) };
    return this.mongoSc.find(query, { sort: { date: 1 } });
  };

  deleteWeightLog = async (id: string | ObjectId) => {
    // Ensure the id is an ObjectId
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    return this.mongoSc.delete(objectId);
  };

  editWeightLog = async (weightLog: WeightLogInterface) => {
    // Ensure the weight log has a valid _id
    if (!weightLog._id) {
      throw new Error('WeightLog must have an _id to be updated');
    }
    // NOTE: We remove _id from the update object to avoid trying to update it
    const { _id, user_id, ...updateData } = weightLog;
    return this.mongoSc.update(_id, updateData);
  };
}
