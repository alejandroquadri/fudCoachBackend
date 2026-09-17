import {
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
  Status,
} from '@apple/app-store-server-library';
import { ObjectId } from 'mongodb';
import { IapModel } from '../models';
import { AppStoreService } from '../services/app-store.service';
import {
  AppStoreEnvironment,
  Entitlement,
  EntitlementResponse,
  IapTransactionSource,
  UserProfile,
  ValidateIOSPayload,
} from '../types';
import { UserController } from './user.controller';

const ALLOWED_SUBSCRIPTION_IDS = new Set(['weekly_plan', 'anual_plan']);

type ValidationResult =
  | { ok: true; entitlement: Entitlement }
  | { ok: false; error: string };

type NotificationMetadata = {
  notificationUUID: string;
  notificationType?: string;
  signedDateISO?: string;
};

export class IapController {
  private appleStoreSc = new AppStoreService();
  private userController = new UserController();
  private iapModel = new IapModel();

  async validateIos(
    payload: ValidateIOSPayload,
    authenticatedUser: UserProfile
  ): Promise<ValidationResult> {
    const { transactionId } = payload;
    if (!transactionId) return { ok: false, error: 'Missing transactionId' };

    const user = await this.userController.ensureAppAccountToken(
      authenticatedUser
    );
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
    this.assertMatchingAllowedSubscription(
      transactionFields.originalTransactionId,
      current.transaction
    );

    const entitlement = await this.persistSubscriptionState(
      user,
      current,
      'client-validation'
    );
    if (!entitlement.active) {
      return { ok: false, error: 'Subscription is not active' };
    }

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
    this.assertMatchingAllowedSubscription(
      stored.originalTransactionId,
      current.transaction
    );

    const ownsTransaction = await this.ensureTransactionOwnership(
      user,
      current.transaction,
      current.environment
    );
    if (!ownsTransaction) {
      throw new Error('Stored subscription belongs to another account');
    }

    const entitlement = await this.persistSubscriptionState(
      user,
      current,
      'entitlement-refresh'
    );

    return {
      ok: true,
      entitlement,
      appAccountToken: user.appAccountToken,
    };
  }

  async processAppStoreNotification(signedPayload: string) {
    if (!signedPayload) throw new Error('Missing signed App Store payload');

    const verified = await this.appleStoreSc.getVerifiedNotification(
      signedPayload
    );
    const notificationUUID = verified.notification.notificationUUID;
    if (!notificationUUID) {
      throw new Error('App Store notification is missing its UUID');
    }

    const transaction = verified.transaction;
    const transactionFields = transaction
      ? this.requireSubscriptionFields(transaction)
      : undefined;
    const notificationType = verified.notification.notificationType;

    await this.iapModel.recordNotification({
      notificationUUID,
      notificationType,
      subtype: verified.notification.subtype,
      transactionId: transaction?.transactionId,
      originalTransactionId: transactionFields?.originalTransactionId,
      environment: verified.environment,
      signedDateISO: this.toISO(verified.notification.signedDate),
    });

    if (!transaction || !transactionFields) {
      await this.iapModel.markNotificationProcessed(
        notificationUUID,
        'ignored',
        'Notification has no subscription transaction data'
      );
      return;
    }
    if (!ALLOWED_SUBSCRIPTION_IDS.has(transactionFields.productId)) {
      await this.iapModel.markNotificationProcessed(
        notificationUUID,
        'ignored',
        'Notification is for an unknown product'
      );
      return;
    }

    const user = await this.findUserForTransaction(transaction);
    if (!user) {
      await this.iapModel.markNotificationProcessed(
        notificationUUID,
        'ignored',
        'No account is linked to this subscription'
      );
      return;
    }

    const account = await this.userController.ensureAppAccountToken(user);
    const ownsTransaction = await this.ensureTransactionOwnership(
      account,
      transaction,
      verified.environment
    );
    if (!ownsTransaction) {
      await this.iapModel.markNotificationProcessed(
        notificationUUID,
        'ignored',
        'Transaction ownership does not match the linked account'
      );
      return;
    }

    const current = await this.appleStoreSc.getVerifiedSubscriptionStatus(
      transactionFields.originalTransactionId
    );
    this.assertMatchingAllowedSubscription(
      transactionFields.originalTransactionId,
      current.transaction
    );
    await this.persistSubscriptionState(
      account,
      current,
      'server-notification',
      {
        notificationUUID,
        notificationType,
        signedDateISO: this.toISO(verified.notification.signedDate),
      }
    );
    await this.iapModel.markNotificationProcessed(
      notificationUUID,
      'processed'
    );
  }

  private async persistSubscriptionState(
    user: UserProfile,
    current: {
      active: boolean;
      status?: number;
      transaction: JWSTransactionDecodedPayload;
      renewalInfo?: JWSRenewalInfoDecodedPayload;
      environment: AppStoreEnvironment;
    },
    source: IapTransactionSource,
    notification?: NotificationMetadata
  ): Promise<Entitlement> {
    const userId = this.toObjectId(this.requireUserId(user));
    const transaction = current.transaction;
    const { originalTransactionId, productId } =
      this.requireSubscriptionFields(transaction);
    const transactionId = this.requireTransactionId(transaction);

    const lineage = await this.iapModel.claimLineage({
      originalTransactionId,
      userId,
      appAccountToken: user.appAccountToken,
      environment: current.environment,
      latestTransactionId: transactionId,
      latestProductId: productId,
    });
    if (!lineage.owned) {
      throw new Error('Subscription lineage belongs to another account');
    }

    const transactionRecord = await this.iapModel.recordTransaction({
      transactionId,
      originalTransactionId,
      userId,
      appAccountToken: transaction.appAccountToken,
      productId,
      environment: current.environment,
      purchasedAtISO: this.toISO(transaction.purchaseDate),
      expiresAtISO: this.toISO(transaction.expiresDate),
      revocationAtISO: this.toISO(transaction.revocationDate),
      subscriptionStatus: current.status,
      source,
      notificationUUID: notification?.notificationUUID,
      notificationType: notification?.notificationType,
      signedDateISO: notification?.signedDateISO,
    });
    if (!transactionRecord.owned) {
      throw new Error('Transaction belongs to another account');
    }

    const entitlement = this.toEntitlement(
      transaction,
      current.environment,
      current.active,
      current.status,
      current.renewalInfo
    );
    await this.userController.updateEntitlementForUser(userId, entitlement);
    return entitlement;
  }

  private async findUserForTransaction(
    transaction: JWSTransactionDecodedPayload
  ) {
    const { originalTransactionId } =
      this.requireSubscriptionFields(transaction);

    if (transaction.appAccountToken) {
      const user = await this.userController.getUserByAppAccountToken(
        transaction.appAccountToken
      );
      if (user) return user;
    }

    const lineage = await this.iapModel.findLineage(originalTransactionId);
    if (lineage) {
      const user = await this.userController.getUserById(lineage.userId);
      if (user) return user;
    }

    return this.userController.getUserByOriginalTransactionId(
      originalTransactionId
    );
  }

  private async ensureTransactionOwnership(
    user: UserProfile,
    transaction: JWSTransactionDecodedPayload,
    environment: AppStoreEnvironment
  ) {
    const { originalTransactionId } =
      this.requireSubscriptionFields(transaction);

    if (transaction.appAccountToken === user.appAccountToken) return true;
    if (transaction.appAccountToken) return false;

    const lineage = await this.iapModel.findLineage(originalTransactionId);
    if (lineage) {
      return lineage.userId.equals(this.toObjectId(this.requireUserId(user)));
    }

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

  private assertMatchingAllowedSubscription(
    originalTransactionId: string,
    transaction: JWSTransactionDecodedPayload
  ) {
    const fields = this.requireSubscriptionFields(transaction);
    if (fields.originalTransactionId !== originalTransactionId) {
      throw new Error('Subscription lineage mismatch');
    }
    if (!ALLOWED_SUBSCRIPTION_IDS.has(fields.productId)) {
      throw new Error('Unknown subscription product');
    }
  }

  private requireSubscriptionFields(transaction: JWSTransactionDecodedPayload) {
    const { originalTransactionId, productId } = transaction;
    if (!originalTransactionId || !productId) {
      throw new Error('Apple transaction is missing subscription fields');
    }
    return { originalTransactionId, productId };
  }

  private requireTransactionId(transaction: JWSTransactionDecodedPayload) {
    if (!transaction.transactionId) {
      throw new Error('Apple transaction is missing its transaction ID');
    }
    return transaction.transactionId;
  }

  private requireUserId(user: UserProfile) {
    if (!user._id) throw new Error('Authenticated user is missing an ID');
    return user._id;
  }

  private toObjectId(id: string | ObjectId) {
    return typeof id === 'string' ? new ObjectId(id) : id;
  }

  private toISO(timestamp?: number) {
    return typeof timestamp === 'number'
      ? new Date(timestamp).toISOString()
      : undefined;
  }

  private toEntitlement(
    transaction: JWSTransactionDecodedPayload,
    environment: AppStoreEnvironment,
    active: boolean,
    status?: number,
    renewalInfo?: JWSRenewalInfoDecodedPayload
  ): Entitlement {
    const { originalTransactionId, productId } =
      this.requireSubscriptionFields(transaction);
    const expiresAtISO = this.toISO(transaction.expiresDate);
    const subscriptionStatus =
      status === Status.ACTIVE
        ? 'active'
        : status === Status.BILLING_GRACE_PERIOD
        ? 'grace'
        : 'inactive';
    const accessExpiresAtISO =
      subscriptionStatus === 'grace'
        ? this.toISO(renewalInfo?.gracePeriodExpiresDate) ?? expiresAtISO
        : expiresAtISO;

    return {
      active: active && !transaction.revocationDate,
      productId,
      originalTransactionId,
      expiresAtISO,
      accessExpiresAtISO,
      subscriptionStatus,
      platform: 'ios',
      environment: environment === 'PRODUCTION' ? 'Production' : 'Sandbox',
    };
  }
}
