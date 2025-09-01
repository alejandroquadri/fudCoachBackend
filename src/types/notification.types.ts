import { ExpoPushReceipt, ExpoPushTicket } from 'expo-server-sdk';
import { ObjectId } from 'mongodb';

export interface SaveNotificationTokenPayload {
  userId: string;
  token: string;
  platform: 'ios' | 'android';
  deviceId?: string;
  appId?: string;
}

export interface PushTokenDoc {
  _id?: string;
  userId: ObjectId;
  token: string;
  platform?: 'ios' | 'android';
  deviceId?: string;
  env?: 'dev' | 'prod';
  appId?: string;
  disabled: boolean;
  lastSentAt?: Date;
  lastError: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PushPayload {
  title?: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  ttl?: number;
  priority?: 'default' | 'normal' | 'high';
  badge?: number;
}

export type SendResult = {
  attemptedTokens: string[]; // tokens we attempted to send to (after filtering valid Expo tokens)
  tickets: ExpoPushTicket[]; // expo tickets
  receipts: Record<string, ExpoPushReceipt>; // receiptId -> receipt
  invalidTokens: string[]; // tokens to disable (DeviceNotRegistered)
  tokenErrors: Record<string, string>; // token -> lastError text (non-fatal)
};

export type NotificationKey =
  | 'dailyPlanner'
  | 'lunchLogReminder'
  | 'dinnerLogReminder';

export interface NotificationSettingDoc {
  _id?: ObjectId;
  userId: ObjectId;
  key: NotificationKey; // one doc per user+key
  enabled: boolean;
  hourLocal: string; // "HH:mm" in user's local time
  timezone: string; // IANA TZ, e.g. "America/Argentina/Buenos_Aires"
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateJobPayload {
  userId: string;
  key: NotificationKey;
  hourLocal: string; // "HH:mm"
  timezone: string; // IANA, required on create
  enabled?: boolean; // default false
}

export interface UpdateJobPayload {
  userId: string;
  key: NotificationKey;
  enabled?: boolean; // optional
  hourLocal?: string; // optional "HH:mm"
  timezone?: string; // optional (change zone)
}
