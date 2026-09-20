import { Collection, ObjectId } from 'mongodb';
import { mongoInstance } from '../connection';
import { AiConversationMessage } from '../types';

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

  list(conversationId: ObjectId, limit = 100) {
    return this.collection
      .find({ conversationId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
  }
}

