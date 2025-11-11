import { JWSTransactionDecodedPayload } from '@apple/app-store-server-library';

export type Entitlement = {
  tx?: JWSTransactionDecodedPayload;
  active: boolean;
  productId: string;
  originalTransactionId: string;
  expiresAtISO?: string;
  platform: 'ios';
  environment?: 'Production' | 'Sandbox'; // NEW
};

export type ValidateIOSPayload = {
  transactionId: string;
  originalTransactionId?: string;
  productId?: string;
  appAccountToken?: string;
};
