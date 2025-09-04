import { cancelUserJob, scheduleUserDailyJob } from '../jobs';
import { NotificationSettingsModel, NotificationsTokensModel } from '../models';
import { PushNotificationsService } from '../services';
import {
  CreateJobPayload,
  PushPayload,
  SaveNotificationTokenPayload,
  UpdateJobPayload,
} from '../types';

export class NotificationController {
  notTokenModel: NotificationsTokensModel = new NotificationsTokensModel();
  notSettingModel: NotificationSettingsModel = new NotificationSettingsModel();
  pushNotSc: PushNotificationsService = new PushNotificationsService();

  async savePushToken(tokenDoc: SaveNotificationTokenPayload) {
    return this.notTokenModel.saveToken(tokenDoc);
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
    const tokens = await this.notTokenModel.listActiveTokensForUser(
      userId,
      env
    );

    // 2) Send via service (no DB here)
    const result = await this.pushNotSc.sendToTokens(tokens, payload);

    // 3) Bookkeeping in DB
    if (result.attemptedTokens.length > 0) {
      await this.notTokenModel.markTokensSent(result.attemptedTokens);
    }
    for (const bad of result.invalidTokens) {
      await this.notTokenModel.disableToken(bad, 'DeviceNotRegistered');
    }
    for (const [tok, err] of Object.entries(result.tokenErrors)) {
      await this.notTokenModel.setTokenLastError(tok, err);
    }

    return {
      ok: true,
      attempted: result.attemptedTokens.length,
      disabled: result.invalidTokens.length,
      tickets: result.tickets,
      receipts: result.receipts,
    };
  }

  // create job (upsert settings + schedule)
  async createJob(payload: CreateJobPayload) {
    const { userId, key, hourLocal, timezone, enabled = false } = payload;

    await this.notSettingModel.upsert(userId, key, {
      hourLocal,
      timezone,
      enabled,
    });

    // ⬇️ replace NotificationEngine.cancel(...)
    await cancelUserJob(userId, key);

    // ⬇️ replace NotificationEngine.schedule(...)
    if (enabled) {
      await scheduleUserDailyJob(userId, key, hourLocal, timezone);
    }

    return { ok: true, userId, key, enabled, hourLocal, timezone };
  }

  // update job (enable/disable and/or change time/zone)
  async updateJob(payload: UpdateJobPayload) {
    const { userId, key, enabled, hourLocal, timezone } = payload;

    // read current settings (to fill missing fields)
    const current = await this.notSettingModel.get(userId, key);
    if (!current) {
      throw Error('could not find nottification setting to update');
    }

    const nextEnabled =
      typeof enabled === 'boolean' ? enabled : Boolean(current.enabled);
    console.log(nextEnabled, 'es boolean', typeof enabled === 'boolean');
    const nextHour = hourLocal ?? current?.hourLocal ?? '08:00';
    const nextZone =
      timezone ?? current?.timezone ?? 'America/Argentina/Buenos_Aires';

    // persist changes
    await this.notSettingModel.upsert(userId, key, {
      ...(typeof enabled === 'boolean'
        ? { enabled }
        : { enabled: current.enabled }),
      ...(hourLocal ? { hourLocal } : { hourLocal: current.hourLocal }),
      ...(timezone ? { timezone } : { timezone: current.timezone }),
    });

    // resync agenda job
    await cancelUserJob(userId, key);
    if (nextEnabled) {
      await scheduleUserDailyJob(userId, key, nextHour, nextZone);
    }

    return {
      ok: true,
      userId,
      key,
      enabled: nextEnabled,
      hourLocal: nextHour,
      timezone: nextZone,
    };
  }
}
