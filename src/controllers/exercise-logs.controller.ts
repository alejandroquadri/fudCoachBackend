import { ObjectId } from 'mongodb';
import { ExerciseLogsModel } from '../models';
import { ExerciseLog } from '../types';

export class ExerciseLogsController {
  exerciseLogsModel: ExerciseLogsModel;
  constructor() {
    this.exerciseLogsModel = new ExerciseLogsModel();
  }

  getExerciseLogsByDate = async (
    userId: string,
    date: string
  ): Promise<ExerciseLog[]> => {
    try {
      return this.exerciseLogsModel.getExerciseLogByDate(userId, date);
    } catch (error) {
      console.error('Error in ctrl getting exercise logs:', error);
      throw error;
    }
  };

  createExerciseLog = async (
    exerciseLog: ExerciseLog
  ): Promise<{
    acknowledged: boolean;
    insertedId: ObjectId;
  }> => {
    try {
      return this.exerciseLogsModel.createExerciseLog(exerciseLog);
    } catch (error) {
      throw new Error('Error creating exercise log');
    }
  };

  editExerciseLog = async (exerciseLog: ExerciseLog) => {
    try {
      if (typeof exerciseLog._id === 'string') {
        exerciseLog._id = new ObjectId(exerciseLog._id);
      }
      return this.exerciseLogsModel.editExerciseLog(exerciseLog);
    } catch (error) {
      throw new Error('Error editing exercise log');
    }
  };

  deleteExerciseLog = async (id: string | ObjectId) => {
    // Ensure the id is an ObjectId
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    return this.exerciseLogsModel.deleteExerciseLog(objectId);
  };
}
