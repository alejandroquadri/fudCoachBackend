import { ObjectId } from 'mongodb';
import { MongoService } from '../services';
import { WaterLog } from '../types';

export class WaterLogsModel {
  collectionName = 'water-logs';
  mongoSc: MongoService<WaterLog>;

  constructor() {
    this.mongoSc = new MongoService<WaterLog>('waterLogs');
  }

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

  // createWaterLog = async (waterLog: OptionalId<WaterLog>) => {
  //   if (typeof waterLog._id === 'string') {
  //     waterLog._id = new ObjectId(waterLog._id);
  //   }
  //   if (typeof waterLog.user_id === 'string') {
  //     waterLog.user_id = new ObjectId(waterLog.user_id);
  //   }
  //   return this.mongoSc.create(waterLog);
  // };
  //
  // editWaterLog = async (waterLog: WaterLog) => {
  //   // Ensure the water log has a valid _id
  //   if (!waterLog._id) {
  //     throw new Error('WaterLog must have an _id to be updated');
  //   }
  //
  //   // remove _id from updateData
  //   const { _id, user_id, ...updateData } = waterLog;
  //   return this.mongoSc.update(_id, updateData);
  // };
  //
  // deleteWaterLog = async (id: string | ObjectId) => {
  //   // Ensure the id is an ObjectId
  //   const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  //   return this.mongoSc.delete(objectId);
  // };
  //
  // getWaterLogsByDate = async (userId: string | ObjectId, date: string) => {
  //   const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
  //   const query = { user_id: objectId, date };
  //   return this.mongoSc.find(query, { sort: { timestamp: -1 } });
  // };
}
