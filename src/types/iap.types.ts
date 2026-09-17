import { JWSTransactionDecodedPayload } from '@apple/app-store-server-library';
import { ObjectId } from 'mongodb';

export type Entitlement = {
  tx?: JWSTransactionDecodedPayload;
  active: boolean;
  productId: string;
  originalTransactionId: string;
  expiresAtISO?: string;
  accessExpiresAtISO?: string;
  subscriptionStatus?: 'active' | 'grace' | 'inactive';
  platform: 'ios';
  environment?: 'Production' | 'Sandbox'; // NEW
  grant?: {
    type: 'staff' | 'promo' | 'test'; // reason for the bypass
    untilISO?: string; // optional expiry for the bypass
  };
};

export type ValidateIOSPayload = {
  transactionId: string;
};

export type EntitlementResponse = {
  ok: true;
  entitlement?: Entitlement;
  appAccountToken: string;
};

export type AppStoreEnvironment = 'PRODUCTION' | 'SANDBOX';

export type IapTransactionSource =
  | 'client-validation'
  | 'server-notification'
  | 'entitlement-refresh';

export interface IapSubscriptionLineage {
  _id?: ObjectId;
  originalTransactionId: string;
  userId: ObjectId;
  appAccountToken: string;
  environment: AppStoreEnvironment;
  latestTransactionId?: string;
  latestProductId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IapTransactionRecord {
  _id?: ObjectId;
  transactionId: string;
  originalTransactionId: string;
  userId: ObjectId;
  appAccountToken?: string;
  productId: string;
  environment: AppStoreEnvironment;
  purchasedAtISO?: string;
  expiresAtISO?: string;
  revocationAtISO?: string;
  subscriptionStatus?: number;
  source: IapTransactionSource;
  notificationUUID?: string;
  notificationType?: string;
  signedDateISO?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IapNotificationRecord {
  _id?: ObjectId;
  notificationUUID: string;
  notificationType?: string;
  subtype?: string;
  transactionId?: string;
  originalTransactionId?: string;
  environment: AppStoreEnvironment;
  signedDateISO?: string;
  processedAt?: Date;
  outcome?: 'processed' | 'ignored';
  reason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
