import { OptionalId, UpdateResult } from 'mongodb';
import { MongoService } from '../services';
import { EntitlementDoc } from '../types';

export class EntitlementsModel {
  collectionName = 'entitlements';
  mongoSc: MongoService<EntitlementDoc>;

  constructor() {
    this.mongoSc = new MongoService<EntitlementDoc>(this.collectionName);
  }

  saveEntitlement(
    doc: Omit<EntitlementDoc, '_id'>
  ): Promise<UpdateResult<EntitlementDoc>> {
    const filter = {
      user_id: doc.user_id,
      platform: doc.platform,
      sku: doc.sku,
    };

    const update = {
      $set: {
        environment: doc.environment,
        originalTransactionId: doc.originalTransactionId,
        expiresAt: doc.expiresAt,
        isActive: doc.isActive,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        user_id: doc.user_id,
        platform: doc.platform,
        sku: doc.sku,
        createdAt: new Date(),
      },
    } as Partial<EntitlementDoc>; // matches your pattern

    return this.mongoSc.upsert(filter as any, update);
  }
}
