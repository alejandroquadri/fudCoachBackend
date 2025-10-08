import { ObjectId, OptionalId } from 'mongodb';
import { ExerciseLog } from '../types';
import { MongoService } from '../services';
import { format, addDays, parseISO } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
const TZ = 'America/Argentina/Buenos_Aires';

export class ExerciseLogsModel {
  collectionName = 'exerciseLogs';
  private mongoSc: MongoService<ExerciseLog>;
  constructor() {
    // Initialize the MongoService for the 'exerciseLogs' collection
    this.mongoSc = new MongoService<ExerciseLog>('exerciseLogs');
  }

  createExerciseLog = async (
    exerciseLog: OptionalId<ExerciseLog>
  ): Promise<{
    acknowledged: boolean;
    insertedId: ObjectId;
  }> => {
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

  getExerciseLogByDateOld = async (userId: string, date: string) => {
    const query = { user_id: new ObjectId(userId), date };
    return this.mongoSc.find(query, { sort: { date: 1 } });
  };

  async getExerciseLogByDate(
    userId: string | ObjectId,
    dateISO: string // "YYYY-MM-DD" in the user's local calendar
  ): Promise<ExerciseLog[]> {
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
      console.error('Error getting exercise logs:', error);
      throw error;
    }
  }
}
