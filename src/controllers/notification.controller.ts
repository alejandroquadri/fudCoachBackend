import { NotificationsModel } from '../models';
import { SaveNotificationTokenPayload } from '../types/notification.types';

export class NotificationController {
  notificationModel: NotificationsModel = new NotificationsModel();
  async savePushToken(tokenDoc: SaveNotificationTokenPayload) {
    return this.notificationModel.saveToken(tokenDoc);
  }
}
