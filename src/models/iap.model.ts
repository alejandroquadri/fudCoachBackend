import { Collection } from 'mongodb';
import { mongoInstance } from '../connection';
import {
  IapNotificationRecord,
  IapSubscriptionLineage,
  IapTransactionRecord,
} from '../types';

const isDuplicateKeyError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 11000;

export class IapModel {
  private lineages: Collection<IapSubscriptionLineage>;
  private transactions: Collection<IapTransactionRecord>;
  private notifications: Collection<IapNotificationRecord>;

  constructor() {
    this.lineages = mongoInstance.db.collection<IapSubscriptionLineage>(
      'iapSubscriptionLineages'
    );
    this.transactions =
      mongoInstance.db.collection<IapTransactionRecord>('iapTransactions');
    this.notifications =
      mongoInstance.db.collection<IapNotificationRecord>('iapNotifications');
  }

  async ensureIndexes() {
    await Promise.all([
      this.lineages.createIndex(
        { originalTransactionId: 1 },
        { unique: true, name: 'iap_lineage_original_transaction_unique' }
      ),
      this.lineages.createIndex({ userId: 1 }, { name: 'iap_lineage_user' }),
      this.transactions.createIndex(
        { transactionId: 1 },
        { unique: true, name: 'iap_transaction_id_unique' }
      ),
      this.transactions.createIndex(
        { originalTransactionId: 1 },
        { name: 'iap_transaction_original_transaction' }
      ),
      this.transactions.createIndex(
        { userId: 1, createdAt: -1 },
        { name: 'iap_transaction_user_created' }
      ),
      this.notifications.createIndex(
        { notificationUUID: 1 },
        { unique: true, name: 'iap_notification_uuid_unique' }
      ),
      this.notifications.createIndex(
        { originalTransactionId: 1, createdAt: -1 },
        { name: 'iap_notification_original_transaction' }
      ),
    ]);
  }

  async findLineage(originalTransactionId: string) {
    return this.lineages.findOne({ originalTransactionId });
  }

  async claimLineage(
    input: Omit<IapSubscriptionLineage, '_id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ owned: boolean; lineage: IapSubscriptionLineage }> {
    const now = new Date();
    try {
      await this.lineages.updateOne(
        {
          originalTransactionId: input.originalTransactionId,
          userId: input.userId,
        },
        {
          $set: {
            appAccountToken: input.appAccountToken,
            environment: input.environment,
            latestTransactionId: input.latestTransactionId,
            latestProductId: input.latestProductId,
            updatedAt: now,
          },
          $setOnInsert: {
            originalTransactionId: input.originalTransactionId,
            userId: input.userId,
            createdAt: now,
          },
        },
        { upsert: true }
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }

    const lineage = await this.findLineage(input.originalTransactionId);
    if (!lineage) throw new Error('Unable to persist subscription lineage');

    return { owned: lineage.userId.equals(input.userId), lineage };
  }

  async recordTransaction(
    input: Omit<IapTransactionRecord, '_id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ owned: boolean; transaction: IapTransactionRecord }> {
    const now = new Date();
    try {
      await this.transactions.updateOne(
        { transactionId: input.transactionId, userId: input.userId },
        {
          $set: { ...input, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }

    const transaction = await this.transactions.findOne({
      transactionId: input.transactionId,
    });
    if (!transaction)
      throw new Error('Unable to persist App Store transaction');

    return { owned: transaction.userId.equals(input.userId), transaction };
  }

  async recordNotification(
    input: Omit<
      IapNotificationRecord,
      '_id' | 'createdAt' | 'updatedAt' | 'processedAt' | 'outcome' | 'reason'
    >
  ) {
    const now = new Date();
    await this.notifications.updateOne(
      { notificationUUID: input.notificationUUID },
      {
        $setOnInsert: {
          ...input,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
  }

  async markNotificationProcessed(
    notificationUUID: string,
    outcome: 'processed' | 'ignored',
    reason?: string
  ) {
    await this.notifications.updateOne(
      { notificationUUID },
      {
        $set: {
          processedAt: new Date(),
          outcome,
          ...(reason ? { reason } : {}),
          updatedAt: new Date(),
        },
      }
    );
  }
}
