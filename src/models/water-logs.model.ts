import { ObjectId } from 'mongodb';
import { MongoService } from '../services';
import { WaterLog } from '../types';

export class WaterLogsModel {
  collectionName = 'water-logs';
  mongoSc: MongoService<WaterLog> = new MongoService<WaterLog>('waterLogs');

  upsertWaterLog(waterLog: WaterLog) {
    // Ensure user_id is an ObjectId
    const userId =
      typeof waterLog.user_id === 'string'
        ? new ObjectId(waterLog.user_id)
        : waterLog.user_id;

    // Define the filter for finding an existing log for the user and date
    const filter = { user_id: userId, date: waterLog.date };

    // Define the update document to increment waterCups and set/update timestamps
    // $inc es un operador espacial de mongo para incrementar ese campo
    // $set es un operador que siempre actualiza ese valor
    // $setOnInsert es un operador que solo actualiza ese valor si no existe
    const update = {
      // $inc: { waterCups: waterLog.waterCups },
      $set: {
        updatedAt: new Date(),
        waterCups: waterLog.waterCups,
      },
      $setOnInsert: {
        user_id: userId,
        createdAt: new Date(),
        date: waterLog.date,
      },
    } as Partial<WaterLog>; // Explicit cast to UpdateFilter<WaterLog>

    // Use the upsert method from MongoService to either update or insert the document
    return this.mongoSc.upsert(filter, update);
  }

  getWaterLogByDate = async (userId: string | ObjectId, date: string) => {
    const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const query = { user_id: objectId, date };
    return this.mongoSc.findOne(query);
  };

  deleteWaterLog = async (id: string | ObjectId) => {
    // Ensure the id is an ObjectId
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    return this.mongoSc.delete(objectId);
  };
}
