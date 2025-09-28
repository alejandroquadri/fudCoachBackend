// controllers/iap.controller.ts
import { ObjectId } from 'mongodb';
import { Entitlement, ValidateIOSPayload, ValidateResponse } from '../types';
import { EntitlementsModel } from '../models/entitlements.model';
import { IapAppleService } from '../services';

export class IapController {
  private entitlements = new EntitlementsModel();
  iapAppleSc: IapAppleService = new IapAppleService();

  validateIos = async (
    payload: ValidateIOSPayload,
    userId: string
  ): Promise<ValidateResponse> => {
    try {
      if (!payload?.productId || !payload?.receiptData) {
        return { ok: false, error: 'missing_fields' };
      }

      const apple = await this.iapAppleSc.verifyReceipt(payload.receiptData);
      if (apple.status !== 0)
        return { ok: false, error: `apple_status_${apple.status}` };
      if (!this.iapAppleSc.isBundleValid(apple))
        return { ok: false, error: 'bundle_mismatch' };

      const latest = this.iapAppleSc.pickLatestLineForSku(
        apple,
        payload.productId
      );
      if (!latest) return { ok: false, error: 'product_not_found_in_receipt' };

      const active = this.iapAppleSc.isActive(latest.expiresAt);
      const environment =
        apple.environment === 'Sandbox' ? 'Sandbox' : 'Production';

      await this.entitlements.saveEntitlement({
        user_id: new ObjectId(userId),
        platform: 'ios',
        sku: payload.productId,
        environment,
        originalTransactionId: latest.originalTransactionId,
        expiresAt: latest.expiresAt,
        isActive: active,
      });

      const entitlement: Entitlement = {
        active,
        sku: payload.productId,
        expiresAtISO: latest.expiresAt?.toISOString(),
        environment,
      };

      return { ok: true, entitlement };
    } catch (err) {
      console.error('validateIos controller error:', err);
      return { ok: false, error: 'server_error' };
    }
  };
}
