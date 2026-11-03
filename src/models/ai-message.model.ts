import { Collection, ObjectId } from 'mongodb';
import { mongoInstance } from '../connection';
import { AiConversationMessage } from '../types';
import {
  decodeCursor,
  encodeCursor,
  PageRequestSchema,
} from '../services/ai/chat-pagination';

export class AiMessageModel {
  private get collection(): Collection<AiConversationMessage> {
    return mongoInstance.db.collection<AiConversationMessage>('aiMessages');
  }

  async ensureIndexes() {
    await Promise.all([
      this.collection.createIndex(
        { conversationId: 1, createdAt: 1, _id: 1 },
        { name: 'ai_message_conversation_order' }
      ),
      this.collection.createIndex(
        { userId: 1, createdAt: -1 },
        { name: 'ai_message_user_history' }
      ),
      this.collection.createIndex(
        { conversationId: 1, clientRequestId: 1, role: 1 },
        {
          unique: true,
          partialFilterExpression: { clientRequestId: { $type: 'string' } },
          name: 'ai_message_client_request_unique',
        }
      ),
    ]);
  }

  async create(message: Omit<AiConversationMessage, '_id' | 'createdAt'>) {
    const document: AiConversationMessage = {
      ...message,
      createdAt: new Date(),
    };
    const result = await this.collection.insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  findUserRequest(conversationId: ObjectId, clientRequestId: string) {
    return this.collection.findOne({
      conversationId,
      clientRequestId,
      role: 'user',
    });
  }

  findAssistantForTurn(conversationId: ObjectId, turnId: string) {
    return this.collection.findOne({
      conversationId,
      turnId,
      role: 'assistant',
    });
  }

  findWelcome(conversationId: ObjectId) {
    return this.collection.findOne({
      conversationId,
      role: 'assistant',
      kind: 'welcome',
    });
  }

  list(conversationId: ObjectId, limit = 40) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('Invalid message limit');
    const cursor = this.collection
      .find({ conversationId })
      .sort({ createdAt: -1, _id: -1 });
    cursor.limit(limit);
    return cursor.toArray();
  }

  async page(
    conversationId: ObjectId,
    options: { limit?: number; before?: string } = {}
  ) {
    const { limit, before } = PageRequestSchema.parse(options);
    const cursor = before ? decodeCursor(before) : undefined;
    const documents = await this.collection
      .find({
        conversationId,
        ...(cursor
          ? {
              $or: [
                { createdAt: { $lt: cursor.date } },
                { createdAt: cursor.date, _id: { $lt: cursor.id } },
              ],
            }
          : {}),
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray();
    const messages = documents.slice(0, limit);
    const last = messages.at(-1);
    return {
      messages,
      nextCursor:
        documents.length > limit && last?._id
          ? encodeCursor(last._id, last.createdAt)
          : null,
    };
  }
}
