import { ObjectId } from 'mongodb';

export type Entitlement = {
  active: boolean;
  sku: string;
  expiresAtISO?: string;
  environment: 'StoreKit' | 'Sandbox' | 'Production';
};

export type ValidateIOSPayload = {
  productId: string;
  transactionId: string;
  receiptData: string; // NEW: base64 app receipt
};

export type ValidateResponse = {
  ok: boolean;
  entitlement?: Entitlement;
  error?: string;
};

export type EntitlementDoc = {
  _id?: ObjectId;
  user_id: ObjectId; // who owns the entitlement
  platform: 'ios';
  sku: string; // productId
  environment: 'Sandbox' | 'Production';
  originalTransactionId?: string;
  expiresAt?: Date;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};
