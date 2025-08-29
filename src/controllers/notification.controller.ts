import { NotificationsModel } from '../models';
import { PushNotificationsService } from '../services';
import {
  PushPayload,
  SaveNotificationTokenPayload,
} from '../types/notification.types';

export class NotificationController {
  notificationModel: NotificationsModel = new NotificationsModel();
  pushNotSc: PushNotificationsService = new PushNotificationsService();

  async savePushToken(tokenDoc: SaveNotificationTokenPayload) {
    return this.notificationModel.saveToken(tokenDoc);
  }

  /**
   * Sends a notification to all active tokens for a user.
   * Controller coordinates: reads tokens via the model, calls the push service,
   * then persists post-send bookkeeping back through the model.
   */
  async sendNotificationToUser(
    userId: string,
    payload: PushPayload,
    env: 'dev' | 'prod' = process.env.NODE_ENV === 'production' ? 'prod' : 'dev'
  ) {
    // 1) Get tokens from DB
    const tokens = await this.notificationModel.listActiveTokensForUser(
      userId,
      env
    );

    // 2) Send via service (no DB here)
    const result = await this.pushNotSc.sendToTokens(tokens, payload);

    // 3) Bookkeeping in DB
    if (result.attemptedTokens.length > 0) {
      await this.notificationModel.markTokensSent(result.attemptedTokens);
    }
    for (const bad of result.invalidTokens) {
      await this.notificationModel.disableToken(bad, 'DeviceNotRegistered');
    }
    for (const [tok, err] of Object.entries(result.tokenErrors)) {
      await this.notificationModel.setTokenLastError(tok, err);
    }

    return {
      ok: true,
      attempted: result.attemptedTokens.length,
      disabled: result.invalidTokens.length,
      tickets: result.tickets,
      receipts: result.receipts,
    };
  }
}
