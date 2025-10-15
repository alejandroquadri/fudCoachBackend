import Expo, {
  ExpoPushMessage,
  ExpoPushReceipt,
  ExpoPushTicket,
} from 'expo-server-sdk';
import { PushPayload, SendResult } from '../types';

export class PushNotificationsService {
  private expo = new Expo();

  /**
   * Sends a push to the provided tokens and returns tickets + receipts.
   * No DB side-effects here.
   */
  async sendToTokens(
    tokens: string[],
    payload: PushPayload
  ): Promise<SendResult> {
    // 1) Filter to valid Expo tokens
    const validTokens = tokens.filter(t => Expo.isExpoPushToken(t));

    if (validTokens.length === 0) {
      return {
        attemptedTokens: [],
        tickets: [],
        receipts: {},
        invalidTokens: [],
        tokenErrors: {},
      };
    }

    // 2) Build messages
    const messages: ExpoPushMessage[] = validTokens.map(t => ({
      to: t,
      sound: payload.sound ?? 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data,
      ttl: payload.ttl,
      priority: payload.priority ?? 'high',
      badge: payload.badge,
    }));

    // 3) Send (chunked) and map ticketId -> token
    const ticketToToken: Record<string, string> = {};
    const tickets: ExpoPushTicket[] = [];
    const chunks = this.expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
      ticketChunk.forEach((t, i) => {
        if (t.status === 'ok' && 'id' in t && t.id) {
          const token = chunk[i]?.to as string | undefined;
          if (token) ticketToToken[t.id] = token;
        }
      });
    }

    // 4) Fetch receipts
    const receipts: Record<string, ExpoPushReceipt> = {};
    const receiptIds = tickets
      .filter(
        (t): t is Extract<ExpoPushTicket, { status: 'ok' }> => t.status === 'ok'
      )
      .map(t => t.id) // t.id is defined in the narrowed branch
      .filter((id): id is string => !!id);
    const idChunks = this.expo.chunkPushNotificationReceiptIds(receiptIds);

    for (const idChunk of idChunks) {
      const rec = await this.expo.getPushNotificationReceiptsAsync(idChunk);
      Object.assign(receipts, rec);
    }

    // 5) Analyze receipts
    const invalidTokens: string[] = [];
    const tokenErrors: Record<string, string> = {};

    for (const [id, r] of Object.entries(receipts)) {
      if (r.status === 'ok') continue;

      const token = ticketToToken[id];
      const detail = (r as any).details?.error;
      const msg = r.message ?? 'Unknown push error';

      if (detail === 'DeviceNotRegistered' && token) {
        invalidTokens.push(token);
      } else if (token) {
        tokenErrors[token] = `${detail || 'PushError'}: ${msg}`;
      }
    }

    return {
      attemptedTokens: validTokens,
      tickets,
      receipts,
      invalidTokens,
      tokenErrors,
    };
  }
}
