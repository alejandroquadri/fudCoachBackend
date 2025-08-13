import { ObjectId } from 'mongodb';

export interface SaveNotificationTokenPayload {
  userId: string;
  token: string;
  platform: 'ios' | 'android';
  deviceId?: string;
  appId?: string;
}

export interface PushTokenDoc {
  _id?: any;
  userId: ObjectId;
  token: string;
  platform?: 'ios' | 'android';
  deviceId?: string;
  appId?: string;
  disabled: boolean;
  lastSentAt?: Date;
  lastError: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
