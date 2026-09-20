import { Collection, ObjectId } from 'mongodb';
import { mongoInstance } from '../connection';
import { AiRun, AiRunOperation } from '../types';

export class AiRunModel {
  private get collection(): Collection<AiRun> {
    return mongoInstance.db.collection<AiRun>('aiRuns');
  }

  async ensureIndexes() {
    await Promise.all([
      this.collection.createIndex(
        { runId: 1 },
        { unique: true, name: 'ai_run_id_unique' }
      ),
      this.collection.createIndex(
        { conversationId: 1, createdAt: -1 },
        { name: 'ai_run_conversation_history' }
      ),
      this.collection.createIndex(
        { conversationId: 1, turnId: 1 },
        { unique: true, name: 'ai_run_turn_unique' }
      ),
    ]);
  }

  async create(run: Omit<AiRun, '_id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date();
    const document: AiRun = { ...run, createdAt: now, updatedAt: now };
    const result = await this.collection.insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  get(runId: string) {
    return this.collection.findOne({ runId });
  }

  getByTurn(conversationId: ObjectId, turnId: string) {
    return this.collection.findOne({ conversationId, turnId });
  }

  async setRoute(runId: string, route: string) {
    await this.collection.updateOne(
      { runId },
      { $set: { route, updatedAt: new Date() } }
    );
  }

  async restart(runId: string) {
    await this.collection.updateOne(
      { runId },
      {
        $set: { status: 'running', updatedAt: new Date() },
        $unset: { error: '', completedAt: '' },
      }
    );
  }

  async addOperation(runId: string, operation: AiRunOperation) {
    await this.collection.updateOne(
      { runId, 'operations.key': { $ne: operation.key } },
      {
        $push: { operations: operation },
        $set: { updatedAt: new Date() },
      }
    );
  }

  async complete(runId: string, outputMessageId: ObjectId) {
    const now = new Date();
    await this.collection.updateOne(
      { runId },
      {
        $set: {
          status: 'completed',
          outputMessageId,
          completedAt: now,
          updatedAt: now,
        },
      }
    );
  }

  async fail(runId: string, error: string) {
    const now = new Date();
    await this.collection.updateOne(
      { runId },
      {
        $set: {
          status: 'failed',
          error,
          completedAt: now,
          updatedAt: now,
        },
      }
    );
  }
}
