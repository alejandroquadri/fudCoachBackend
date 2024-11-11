import { ObjectId, OptionalId } from 'mongodb';
import { ExerciseLog } from '../types';
import { MongoService } from '../services';

export class ExerciseLogsModel {
  collectionName = 'exerciseLogs';
  private mongoSc: MongoService<ExerciseLog>;
  constructor() {
    // Initialize the MongoService for the 'exerciseLogs' collection
    this.mongoSc = new MongoService<ExerciseLog>('exerciseLogs');
  }

  createExerciseLog = async (exerciseLog: OptionalId<ExerciseLog>) => {
    if (typeof exerciseLog._id === 'string') {
      exerciseLog._id = new ObjectId(exerciseLog._id);
    }
    if (typeof exerciseLog.user_id === 'string') {
      exerciseLog.user_id = new ObjectId(exerciseLog.user_id);
    }
    return this.mongoSc.create(exerciseLog);
  };

  editExerciseLog = async (exerciseLog: ExerciseLog) => {
    // Ensure the exercise log has a valid _id
    if (!exerciseLog._id) {
      throw new Error('ExerciseLog must have an _id to be updated');
    }

    // NOTE: Remove _id from the update object to avoid trying to update it
    const { _id, user_id, ...updateData } = exerciseLog;

    return this.mongoSc.update(_id, updateData);
  };

  deleteExerciseLog = async (id: string | ObjectId) => {
    // Ensure the id is an ObjectId
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    return this.mongoSc.delete(objectId);
  };

  getExerciseLogByDate = async (userId: string, date: string) => {
    const query = { user_id: new ObjectId(userId), date };
    return this.mongoSc.find(query, { sort: { date: 1 } });
  };
}
