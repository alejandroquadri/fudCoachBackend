import { ObjectId } from 'mongodb';
import { ExerciseLogsModel } from '../models';
import { AiExerciseLogPayload, ExerciseLog } from '../types';

export class ExerciseLogsController {
  exerciseLogsModel: ExerciseLogsModel = new ExerciseLogsModel();

  async getExerciseLogsByDate(
    userId: string,
    date: string
  ): Promise<ExerciseLog[]> {
    try {
      return this.exerciseLogsModel.getExerciseLogByDate(userId, date);
    } catch (error) {
      console.error('Error in ctrl getting exercise logs:', error);
      throw error;
    }
  }

  async createExerciseLog(exerciseLog: ExerciseLog): Promise<{
    acknowledged: boolean;
    insertedId: ObjectId;
  }> {
    try {
      return this.exerciseLogsModel.createExerciseLog(exerciseLog);
    } catch (error) {
      throw new Error('Error creating exercise log');
    }
  }

  async createAiExerciseLog(
    aiExerciseLog: AiExerciseLogPayload,
    userId: string
  ) {
    try {
      const { exerciseName, duration, caloriesBurned } = aiExerciseLog;
      const exerciseLog: ExerciseLog = {
        user_id: userId,
        exerciseName,
        duration,
        caloriesBurned,
      };
      return this.exerciseLogsModel.createExerciseLog(exerciseLog);
    } catch (error) {
      throw new Error('Error creating ai exercise log');
    }
  }

  // export interface ExerciseLog {
  //   _id?: ObjectId | string;
  //   user_id: string | ObjectId;
  //   createdAt?: Date; // timestamp when log was created
  //   updatedAt?: Date; // timestamp when log was updated
  //   date: string;
  //   hour: string;
  //   exerciseName: string;
  //   duration: number;
  //   caloriesBurned: number;
  // }

  async editExerciseLog(exerciseLog: ExerciseLog) {
    try {
      if (typeof exerciseLog._id === 'string') {
        exerciseLog._id = new ObjectId(exerciseLog._id);
      }
      return this.exerciseLogsModel.editExerciseLog(exerciseLog);
    } catch (error) {
      throw new Error('Error editing exercise log');
    }
  }

  async deleteExerciseLog(id: string | ObjectId) {
    try {
      const objectId = typeof id === 'string' ? new ObjectId(id) : id;
      return this.exerciseLogsModel.deleteExerciseLog(objectId);
    } catch (error) {
      throw new Error('Error deleting exercise log');
    }
  }
}
