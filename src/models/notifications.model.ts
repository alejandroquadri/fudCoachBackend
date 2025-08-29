import { ObjectId } from 'mongodb';
import { MongoService } from '../services';
import {
  PushTokenDoc,
  SaveNotificationTokenPayload,
} from '../types/notification.types';

export class NotificationsModel {
  collectionName = 'pushTokens';
  mongoSc: MongoService<PushTokenDoc> = new MongoService<PushTokenDoc>(
    this.collectionName
  );

  /** Helper: fetch one token doc by token string */
  async getByToken(token: string) {
    return this.mongoSc.findOne({ token });
  }

  /** Create a new token document (one document per unique token) */
  async createToken(payload: SaveNotificationTokenPayload) {
    const env: 'dev' | 'prod' =
      process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    const doc: Omit<PushTokenDoc, '_id' | 'createdAt' | 'updatedAt'> = {
      userId: new ObjectId(payload.userId),
      token: payload.token,
      platform: payload.platform,
      deviceId: payload.deviceId,
      env,
      appId: payload.appId,
      disabled: false,
      lastError: null,
      // createdAt/updatedAt are added by MongoService.create
    };

    const result = await this.mongoSc.create(doc);
    return { created: true, id: result.insertedId };
  }

  /**
   * Update an existing token document (looked up by token).
   * Re-associates to user if needed, enables the token, and updates metadata.
   */
  async updateTokenByToken(
    token: string,
    updates: Omit<SaveNotificationTokenPayload, 'token'>
  ) {
    const existing = await this.getByToken(token);
    if (!existing) {
      throw new Error('Token not found');
    }

    const env: 'dev' | 'prod' =
      process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    await this.mongoSc.update(existing._id, {
      userId: new ObjectId(updates.userId),
      platform: updates.platform,
      deviceId: updates.deviceId,
      appId: updates.appId,
      env,
      disabled: false,
      lastError: null,
      // updatedAt is added by MongoService.update
    } as Partial<PushTokenDoc>);

    return { updated: true, id: existing._id };
  }

  /**
   * Convenience method: save-or-update using create/update under the hood,
   * without touching your shared upsert signature.
   */
  async saveToken(payload: SaveNotificationTokenPayload) {
    const existing = await this.getByToken(payload.token);
    if (existing) {
      return this.updateTokenByToken(payload.token, {
        userId: payload.userId,
        platform: payload.platform,
        deviceId: payload.deviceId,
        appId: payload.appId,
      });
    }
    return this.createToken(payload);
  }

  // ---------- Reads for sending ----------

  async listActiveTokensForUser(userId: string, env: 'dev' | 'prod') {
    const docs = await this.mongoSc.find({
      userId: new ObjectId(userId),
      disabled: { $ne: true },
      env,
    });
    return docs.map(d => d.token);
  }

  // ---------- Post-send bookkeeping ----------

  async markTokensSent(tokens: string[]) {
    if (!tokens.length) return;
    const docs = await this.mongoSc.find({ token: { $in: tokens } });
    await Promise.all(
      docs.map(d =>
        this.mongoSc.update(d._id, {
          lastSentAt: new Date(),
          lastError: null,
        } as Partial<PushTokenDoc>)
      )
    );
  }

  async disableToken(token: string, reason: string) {
    const existing = await this.getByToken(token);
    if (!existing) return;
    await this.mongoSc.update(existing._id, {
      disabled: true,
      lastError: reason,
    } as Partial<PushTokenDoc>);
  }

  async setTokenLastError(token: string, message: string) {
    const existing = await this.getByToken(token);
    if (!existing) return;
    await this.mongoSc.update(existing._id, {
      lastError: message,
    } as Partial<PushTokenDoc>);
  }
}
