import { Db } from 'mongodb';
import { mongoInstance } from '../connection';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export class CheckpointRetentionModel {
  private readonly scheduled = new Map<string, number>();
  constructor(private readonly database: () => Db = () => mongoInstance.db) {}
  async ensureIndexes() {
    for (const name of ['aiCheckpoints', 'aiCheckpointWrites']) {
      await this.database()
        .collection(name)
        .createIndex(
          { expiresAt: 1 },
          { expireAfterSeconds: 0, name: 'ai_obsolete_checkpoint_expiry' }
        );
    }
  }
  async schedule(threadId: string, now = Date.now()) {
    if ((this.scheduled.get(threadId) ?? 0) > now) return;
    const checkpoints = this.database().collection('aiCheckpoints');
    // Keep the latest checkpoint and its immediate parent indefinitely.
    const latest = await checkpoints
      .find({ thread_id: threadId, checkpoint_ns: '' })
      .sort({ checkpoint_id: -1 })
      .limit(2)
      .toArray();
    if (latest.length < 2) return;
    const filter = {
      thread_id: threadId,
      checkpoint_ns: '',
      checkpoint_id: { $lt: latest[1].checkpoint_id },
      expiresAt: { $exists: false },
    };
    const update = { $set: { expiresAt: new Date(now + RETENTION_MS) } };
    await checkpoints.updateMany(filter, update);
    await this.database()
      .collection('aiCheckpointWrites')
      .updateMany(filter, update);
    if (this.scheduled.size >= 1000)
      this.scheduled.delete(this.scheduled.keys().next().value!);
    this.scheduled.set(threadId, now + 60 * 60 * 1000);
  }
}
