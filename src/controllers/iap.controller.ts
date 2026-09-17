import { JWSTransactionDecodedPayload } from '@apple/app-store-server-library';
import { AppStoreService } from '../services/app-store.service';
import {
  Entitlement,
  EntitlementResponse,
  UserProfile,
  ValidateIOSPayload,
} from '../types';
import { UserController } from './user.controller';

const ALLOWED_SUBSCRIPTION_IDS = new Set(['weekly_plan', 'anual_plan']);

type ValidationResult =
  | { ok: true; entitlement: Entitlement }
  | { ok: false; error: string };

export class IapController {
  private appleStoreSc = new AppStoreService();
  private userController = new UserController();

  async validateIos(
    payload: ValidateIOSPayload,
    authenticatedUser: UserProfile
  ): Promise<ValidationResult> {
    const { transactionId } = payload;
    if (!transactionId) return { ok: false, error: 'Missing transactionId' };

    const user = await this.userController.ensureAppAccountToken(
      authenticatedUser
    );
    const userId = this.requireUserId(user);
    const verified = await this.appleStoreSc.getVerifiedTransactionById(
      transactionId
    );
    const transactionFields = this.requireSubscriptionFields(
      verified.transaction
    );

    if (!ALLOWED_SUBSCRIPTION_IDS.has(transactionFields.productId)) {
      return { ok: false, error: 'Unknown subscription product' };
    }

    const ownsTransaction = await this.ensureTransactionOwnership(
      user,
      verified.transaction,
      verified.environment
    );
    if (!ownsTransaction) {
      return { ok: false, error: 'Transaction belongs to another account' };
    }

    const current = await this.appleStoreSc.getVerifiedSubscriptionStatus(
      transactionFields.originalTransactionId
    );
    const currentFields = this.requireSubscriptionFields(current.transaction);

    if (
      currentFields.originalTransactionId !==
      transactionFields.originalTransactionId
    ) {
      return { ok: false, error: 'Subscription lineage mismatch' };
    }
    if (!ALLOWED_SUBSCRIPTION_IDS.has(currentFields.productId)) {
      return { ok: false, error: 'Unknown subscription product' };
    }
    if (!current.active || current.transaction.revocationDate) {
      return { ok: false, error: 'Subscription is not active' };
    }

    const entitlement = this.toEntitlement(
      current.transaction,
      current.environment,
      current.active
    );
    await this.userController.updateEntitlementForUser(userId, entitlement);

    return { ok: true, entitlement };
  }

  async getCurrentEntitlement(
    authenticatedUser: UserProfile
  ): Promise<EntitlementResponse> {
    const user = await this.userController.ensureAppAccountToken(
      authenticatedUser
    );
    const userId = this.requireUserId(user);
    const stored = user.entitlement;

    if (!stored) return { ok: true, appAccountToken: user.appAccountToken };

    const grant = stored.grant;
    if (grant) {
      const active =
        stored.active &&
        (!grant.untilISO || new Date(grant.untilISO).getTime() > Date.now());
      const entitlement = { ...stored, active };
      if (active !== stored.active) {
        await this.userController.updateEntitlementForUser(userId, entitlement);
      }
      return {
        ok: true,
        entitlement,
        appAccountToken: user.appAccountToken,
      };
    }

    if (
      !stored.originalTransactionId ||
      stored.originalTransactionId === 'manual'
    ) {
      return { ok: true, appAccountToken: user.appAccountToken };
    }

    const current = await this.appleStoreSc.getVerifiedSubscriptionStatus(
      stored.originalTransactionId
    );
    const fields = this.requireSubscriptionFields(current.transaction);
    if (!ALLOWED_SUBSCRIPTION_IDS.has(fields.productId)) {
      throw new Error('Unknown subscription product in stored entitlement');
    }

    const ownsTransaction = await this.ensureTransactionOwnership(
      user,
      current.transaction,
      current.environment
    );
    if (!ownsTransaction) {
      throw new Error('Stored subscription belongs to another account');
    }

    const entitlement = this.toEntitlement(
      current.transaction,
      current.environment,
      current.active
    );
    await this.userController.updateEntitlementForUser(userId, entitlement);

    return {
      ok: true,
      entitlement,
      appAccountToken: user.appAccountToken,
    };
  }

  private async ensureTransactionOwnership(
    user: UserProfile,
    transaction: JWSTransactionDecodedPayload,
    environment: 'PRODUCTION' | 'SANDBOX'
  ) {
    const { originalTransactionId } =
      this.requireSubscriptionFields(transaction);

    if (transaction.appAccountToken === user.appAccountToken) return true;
    if (transaction.appAccountToken) return false;

    const isKnownLegacySubscription =
      user.entitlement?.originalTransactionId === originalTransactionId;
    if (!isKnownLegacySubscription) return false;

    await this.appleStoreSc.setAppAccountToken(
      originalTransactionId,
      user.appAccountToken,
      environment
    );
    return true;
  }

  private requireSubscriptionFields(transaction: JWSTransactionDecodedPayload) {
    const { originalTransactionId, productId } = transaction;
    if (!originalTransactionId || !productId) {
      throw new Error('Apple transaction is missing subscription fields');
    }
    return { originalTransactionId, productId };
  }

  private requireUserId(user: UserProfile) {
    if (!user._id) throw new Error('Authenticated user is missing an ID');
    return user._id;
  }

  private toEntitlement(
    transaction: JWSTransactionDecodedPayload,
    environment: 'PRODUCTION' | 'SANDBOX',
    active: boolean
  ): Entitlement {
    const { originalTransactionId, productId } =
      this.requireSubscriptionFields(transaction);
    const expiresMs = transaction.expiresDate;

    return {
      active: active && !transaction.revocationDate,
      productId,
      originalTransactionId,
      expiresAtISO: expiresMs ? new Date(expiresMs).toISOString() : undefined,
      platform: 'ios',
      environment: environment === 'PRODUCTION' ? 'Production' : 'Sandbox',
    };
  }
}
