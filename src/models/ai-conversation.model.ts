import { randomUUID } from 'crypto';
import { Collection, ObjectId } from 'mongodb';
import { mongoInstance } from '../connection';
import { AiConversation } from '../types';

const GRAPH_VERSION = 1;

export class AiConversationModel {
  private get collection(): Collection<AiConversation> {
    return mongoInstance.db.collection<AiConversation>('aiConversations');
  }

  async ensureIndexes() {
    await Promise.all([
      this.collection.createIndex(
        { userId: 1 },
        {
          unique: true,
          partialFilterExpression: { status: 'active' },
          name: 'ai_conversation_one_active_per_user',
        }
      ),
      this.collection.createIndex(
        { threadId: 1 },
        { unique: true, name: 'ai_conversation_thread_unique' }
      ),
    ]);
  }

  async getActive(userId: string | ObjectId) {
    return this.collection.findOne({
      userId: this.toObjectId(userId),
      status: 'active',
    });
  }

  async getOrCreateActive(userId: string | ObjectId) {
    const objectId = this.toObjectId(userId);
    const existing = await this.getActive(objectId);
    if (existing) return existing;

    const now = new Date();
    const conversation: AiConversation = {
      userId: objectId,
      threadId: randomUUID(),
      status: 'active',
      graphVersion: GRAPH_VERSION,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const result = await this.collection.insertOne(conversation);
      return { ...conversation, _id: result.insertedId };
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const concurrent = await this.getActive(objectId);
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  async startNew(userId: string | ObjectId) {
    const objectId = this.toObjectId(userId);
    const now = new Date();
    await this.collection.updateMany(
      { userId: objectId, status: 'active' },
      { $set: { status: 'archived', archivedAt: now, updatedAt: now } }
    );
    return this.getOrCreateActive(objectId);
  }

  async tryAcquireLease(
    conversationId: ObjectId,
    owner: string,
    leaseMs: number
  ) {
    const now = new Date();
    const result = await this.collection.findOneAndUpdate(
      {
        _id: conversationId,
        status: 'active',
        $or: [
          { lease: { $exists: false } },
          { 'lease.expiresAt': { $lte: now } },
          { 'lease.owner': owner },
        ],
      },
      {
        $set: {
          lease: { owner, expiresAt: new Date(now.getTime() + leaseMs) },
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    );
    return result !== null;
  }

  async releaseLease(conversationId: ObjectId, owner: string) {
    await this.collection.updateOne(
      { _id: conversationId, 'lease.owner': owner },
      { $unset: { lease: '' }, $set: { updatedAt: new Date() } }
    );
  }

  private toObjectId(userId: string | ObjectId) {
    return typeof userId === 'string' ? new ObjectId(userId) : userId;
  }

  private isDuplicateKeyError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}

