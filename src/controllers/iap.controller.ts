import { AppStoreService } from '../services/app-store.service';
import { Entitlement, ValidateIOSPayload } from '../types';

export class IapController {
  private appleStoreSc = new AppStoreService();

  async validateIos(
    payload: ValidateIOSPayload
  ): Promise<
    { ok: true; entitlement: Entitlement } | { ok: false; error: string }
  > {
    try {
      const { transactionId } = payload;
      if (!transactionId) return { ok: false, error: 'Missing transactionId' };

      console.log('esto envio al get verified: ', transactionId);
      const { transaction, environment } =
        await this.appleStoreSc.getVerifiedTransactionById(transactionId);

      // Optional: assert bundleId or appAccountToken matches your expectation here.

      const expiresMs = transaction.expiresDate
        ? Number(transaction.expiresDate)
        : undefined;

      const active =
        typeof expiresMs === 'number' ? Date.now() < expiresMs : true;

      const entitlement: Entitlement = {
        // tx: transaction,
        active,
        productId: transaction.productId,
        originalTransactionId: transaction.originalTransactionId,
        expiresAtISO: expiresMs
          ? new Date(Number(transaction.expiresDate)).toISOString()
          : undefined,
        platform: 'ios',
        environment: environment === 'PRODUCTION' ? 'Production' : 'Sandbox',
      };

      return { ok: true, entitlement };
    } catch (e) {
      return { ok: false, error: 'Apple validation failed' };
    }
  }

  checkSubscriptionStatus(originalTx: string) {
    return this.appleStoreSc.checkSubscriptionStatus(originalTx);
  }
}
