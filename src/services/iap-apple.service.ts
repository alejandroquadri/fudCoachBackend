import axios from 'axios';

export type AppleVerifyResponse = {
  status: number;
  environment?: 'Sandbox' | 'Production';
  is_retryable?: boolean;
  receipt?: {
    bundle_id?: string;
    in_app?: any[];
  };
  latest_receipt_info?: any[];
};

type LatestLine = {
  originalTransactionId?: string;
  expiresAt?: Date;
};

export class IapAppleService {
  private verifyProdURL = 'https://buy.itunes.apple.com/verifyReceipt';
  private verifySandboxURL = 'https://sandbox.itunes.apple.com/verifyReceipt';
  private sharedSecret = process.env.IOS_SHARED_SECRET || '';
  private bundleId = process.env.IOS_BUNDLE_ID || '';

  // POST helper to Apple
  private postToApple = async (
    url: string,
    base64Receipt: string
  ): Promise<AppleVerifyResponse> => {
    const payload = {
      'receipt-data': base64Receipt,
      password: this.sharedSecret, // required for auto-renewable subs
      'exclude-old-transactions': true,
    };

    const { data } = await axios.post<AppleVerifyResponse>(url, payload, {
      timeout: 10000,
    });
    return data;
  };

  // Public: verify a receipt (prod → sandbox fallback on 21007)
  public verifyReceipt = async (
    base64Receipt: string
  ): Promise<AppleVerifyResponse> => {
    if (!this.sharedSecret) {
      throw new Error('APPLE_SHARED_SECRET not set');
    }
    let resp = await this.postToApple(this.verifyProdURL, base64Receipt);
    if (resp.status === 21007) {
      resp = await this.postToApple(this.verifySandboxURL, base64Receipt);
    }
    return resp;
  };

  // Public: optional bundleId guard (returns true if OK or if Apple omitted bundle)
  public isBundleValid = (resp: AppleVerifyResponse): boolean => {
    const b = resp.receipt?.bundle_id;
    if (!this.bundleId || !b) return true;
    return b === this.bundleId;
  };

  // Public: pick the most recent line for a SKU and compute expiry
  public pickLatestLineForSku = (
    resp: AppleVerifyResponse,
    sku: string
  ): LatestLine | null => {
    const lines = resp.latest_receipt_info || resp.receipt?.in_app || [];
    const matches = lines.filter((l: any) => l.product_id === sku);
    if (matches.length === 0) return null;

    matches.sort((a: any, b: any) => {
      const aMs = Number(a.expires_date_ms || a.purchase_date_ms || 0);
      const bMs = Number(b.expires_date_ms || b.purchase_date_ms || 0);
      return bMs - aMs;
    });

    const latest = matches[0];
    const expiresAt = latest.expires_date_ms
      ? new Date(Number(latest.expires_date_ms))
      : undefined;

    return {
      originalTransactionId: latest.original_transaction_id,
      expiresAt,
    };
  };

  // Public: quick helper to tell if a sub line is currently active
  public isActive = (expiresAt?: Date): boolean => {
    if (!expiresAt) return true; // non-expiring items
    return expiresAt.getTime() > Date.now();
  };
}
