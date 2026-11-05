import { ObjectId } from 'mongodb';
import { mongoInstance } from '../connection';
import {
  CoachMemory,
  emptyMemory,
  MemorySections,
} from '../services/ai/coach-memory';

export class CoachMemoryModel {
  private get users() {
    return mongoInstance.db.collection('users');
  }

  async get(userId: string): Promise<CoachMemory> {
    const user = await this.users.findOne(
      { _id: new ObjectId(userId) },
      { projection: { coachMemory: 1 } }
    );
    if (!user) throw new Error('User not found');
    return { ...emptyMemory(), ...user.coachMemory };
  }

  async save(
    userId: string,
    sections: MemorySections & { routines?: CoachMemory['routines'] },
    revision: number,
    source: 'user' | 'agent'
  ): Promise<CoachMemory | null> {
    const now = new Date().toISOString();
    const filter =
      revision === 0
        ? {
            $or: [
              { 'coachMemory.revision': 0 },
              { 'coachMemory.revision': { $exists: false } },
            ],
          }
        : { 'coachMemory.revision': revision };
    const document = await this.users.findOneAndUpdate(
      { _id: new ObjectId(userId), ...filter },
      {
        $set: {
          'coachMemory.goals': sections.goals,
          'coachMemory.relationships': sections.relationships,
          'coachMemory.preferences': sections.preferences,
          'coachMemory.context': sections.context,
          ...(sections.routines !== undefined
            ? { 'coachMemory.routines': sections.routines }
            : {}),
          'coachMemory.revision': revision + 1,
          'coachMemory.updatedAt': now,
          ...(source === 'user' ? { 'coachMemory.contextResetAt': now } : {}),
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after', projection: { coachMemory: 1 } }
    );
    return document ? { ...emptyMemory(), ...document.coachMemory } : null;
  }
}
