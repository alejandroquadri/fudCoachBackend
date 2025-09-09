import { ObjectId } from 'mongodb';
import { MongoService } from '../services';
import { NotificationSettingDoc, NotificationKey } from '../types';

const NOTIFICATION_KEYS = [
  'dailyPlanner',
  'lunchLogReminder',
  'dinnerLogReminder',
];

export class NotificationSettingsModel {
  private mongoSc = new MongoService<NotificationSettingDoc>(
    'notificationSettings'
  );

  async get(userId: string | ObjectId, key: NotificationKey) {
    const _id = typeof userId === 'string' ? new ObjectId(userId) : userId;
    return this.mongoSc.findOne({ userId: _id, key });
  }

  async getNotificationsByUser(
    userId: string | ObjectId
  ): Promise<NotificationSettingDoc[]> {
    const query = { userId: new ObjectId(userId) };
    return this.mongoSc.find(query, { sort: { timestamp: -1 } });
  }

  async upsert(
    userId: string,
    key: NotificationKey,
    patch: Partial<NotificationSettingDoc>
  ) {
    const _id = typeof userId === 'string' ? new ObjectId(userId) : userId;

    const filter = { userId: _id, key };

    const update = {
      $set: {
        updatedAt: new Date(),
        timezone: patch.timezone,
        hourLocal: patch.hourLocal,
        enabled: patch.enabled,
      },
      $setOnInsert: {
        userId: _id,
        key,
        createdAt: new Date(),
      },
    } as Partial<NotificationSettingDoc>;

    console.log('mando filter y update');
    return this.mongoSc.upsert(filter, update);
  }

  isNotificationKey = (k: string): k is NotificationKey =>
    (NOTIFICATION_KEYS as readonly string[]).includes(k);
}
