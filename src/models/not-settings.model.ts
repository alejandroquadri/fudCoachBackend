import { ObjectId } from 'mongodb';
import { MongoService } from '../services';
import { NotificationSettingDoc, NotificationKey } from '../types';

export class NotificationSettingsModel {
  private mongoSc = new MongoService<NotificationSettingDoc>(
    'notificationSettings'
  );

  async get(userId: string | ObjectId, key: NotificationKey) {
    const _id = typeof userId === 'string' ? new ObjectId(userId) : userId;
    return this.mongoSc.findOne({ userId: _id, key });
  }

  async getNotificationsByUser(userId: string | ObjectId) {
    const query = { userId: new ObjectId(userId) };
    return this.mongoSc.find(query, { sort: { timestamp: -1 } });
  }

  async upsert(
    userId: string,
    key: NotificationKey,
    patch: Partial<NotificationSettingDoc>
  ) {
    console.log('arranco upsert');
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
        createdAt: new Date(),
      },
    } as Partial<NotificationSettingDoc>;

    console.log('mando filter y update');
    return this.mongoSc.upsert(filter, update);
  }
}

// async upsert(
//   userId: string,
//   key: NotificationKey,
//   patch: Partial<NotificationSettingDoc>
// ) {
//   const _id = new ObjectId(userId);
//
//   // Check if it already exists to decide whether to apply defaults
//   const existing = await this.mongoSc.findOne({ userId: _id, key });
//
//   const defaultsOnInsert: Partial<NotificationSettingDoc> = existing
//     ? {}
//     : {
//         enabled: false,
//         hourLocal: '08:00',
//         timezone: 'America/Argentina/Buenos_Aires',
//         createdAt: new Date(),
//       };
//
//   // IMPORTANT: pass a plain doc (MongoService.upsert will $set internally)
//   const doc: Partial<NotificationSettingDoc> = {
//     userId: _id,
//     key,
//     ...defaultsOnInsert,
//     ...patch,
//     updatedAt: new Date(),
//   };
//
//   return this.mongoSc.upsert({ userId: _id, key }, doc);
// }
