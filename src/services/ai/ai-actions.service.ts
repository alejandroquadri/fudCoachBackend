import { format } from 'date-fns';
import { ClientSession, ObjectId } from 'mongodb';
import { mongoInstance } from '../../connection';
import { AiFoodLogPayload, AiExerciseLogPayload, AiRun } from '../../types';
import { applyPreferenceListChange } from './ai-utils';

export type PreferenceListChange = {
  operation: 'add' | 'remove' | 'replace';
  values: string[];
};

export type AgentPreferenceChange = {
  name?: string;
  likes?: PreferenceListChange;
  dislikes?: PreferenceListChange;
};

export class AiActionsService {
  async logMeals(runId: string, userId: string, meals: AiFoodLogPayload[]) {
    return this.executeOnce(runId, 'log-meals', async session => {
      const now = new Date();
      const documents = meals.map(meal => ({
        user_id: new ObjectId(userId),
        foodObj: {
          foodName: meal.name,
          servings: meal.quantity,
          size: meal.serving_size,
          calories: meal.calories,
          carbohydrates: meal.carbs,
          proteins: meal.protein,
          fats: meal.fat,
        },
        createdAt: now,
        updatedAt: now,
      }));
      if (documents.length > 0) {
        await mongoInstance.db
          .collection('foodLogs')
          .insertMany(documents, { session });
      }
      return { count: documents.length };
    });
  }

  async logWeight(runId: string, userId: string, weight: number) {
    return this.executeOnce(runId, 'log-weight', async session => {
      const now = new Date();
      await mongoInstance.db.collection('weightLogs').insertOne(
        {
          user_id: new ObjectId(userId),
          date: format(now, 'yyyy-MM-dd'),
          weightLog: weight,
          createdAt: now,
          updatedAt: now,
        },
        { session }
      );
      return { weight };
    });
  }

  async logExercise(
    runId: string,
    userId: string,
    exercise: AiExerciseLogPayload
  ) {
    return this.executeOnce(runId, 'log-exercise', async session => {
      const now = new Date();
      await mongoInstance.db.collection('exerciseLogs').insertOne(
        {
          user_id: new ObjectId(userId),
          ...exercise,
          createdAt: now,
          updatedAt: now,
        },
        { session }
      );
      return exercise;
    });
  }

  async updatePreferences(
    runId: string,
    userId: string,
    change: AgentPreferenceChange
  ) {
    return this.executeOnce(runId, 'update-preferences', async session => {
      const users = mongoInstance.db.collection('users');
      const objectId = new ObjectId(userId);
      const user = await users.findOne({ _id: objectId }, { session });
      if (!user) throw new Error('No se encontró usuario');

      const update: Record<string, unknown> = {};
      if (change.name?.trim()) update.name = change.name.trim();
      if (change.likes) {
        update.likes = applyPreferenceListChange(user.likes, change.likes);
      }
      if (change.dislikes) {
        update.dislikes = applyPreferenceListChange(
          user.dislikes,
          change.dislikes
        );
      }
      if (Object.keys(update).length === 0) {
        throw new Error('No supported preference change was detected');
      }

      await users.updateOne(
        { _id: objectId },
        { $set: { ...update, updatedAt: new Date() } },
        { session }
      );
      return update;
    });
  }

  private async executeOnce<T>(
    runId: string,
    key: string,
    operation: (session: ClientSession) => Promise<T>
  ): Promise<T> {
    const session = mongoInstance.client.startSession();
    let result: T | undefined;
    try {
      await session.withTransaction(async () => {
        const runs = mongoInstance.db.collection<AiRun>('aiRuns');
        const run = await runs.findOne({ runId }, { session });
        if (!run) throw new Error(`AI run ${runId} was not found`);

        const completed = (run.operations ?? []).find(
          (item: { key: string; status: string }) =>
            item.key === key && item.status === 'completed'
        );
        if (completed) {
          result = completed.result as T;
          return;
        }

        result = await operation(session);
        await runs.updateOne(
          { runId, 'operations.key': { $ne: key } },
          {
            $push: {
              operations: {
                key,
                status: 'completed' as const,
                result,
                completedAt: new Date(),
              },
            },
            $set: { updatedAt: new Date() },
          },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }
    if (result === undefined) throw new Error(`AI operation ${key} failed`);
    return result;
  }
}
