import { JWSTransactionDecodedPayload } from '@apple/app-store-server-library';

export type Entitlement = {
  tx?: JWSTransactionDecodedPayload;
  active: boolean;
  productId: string;
  originalTransactionId: string;
  expiresAtISO?: string;
  platform: 'ios';
  environment?: 'Production' | 'Sandbox'; // NEW
  grant?: {
    type: 'staff' | 'promo' | 'test'; // reason for the bypass
    untilISO?: string; // optional expiry for the bypass
  };
};

export type ValidateIOSPayload = {
  transactionId: string;
  originalTransactionId?: string;
  productId?: string;
  appAccountToken?: string;
};
