import { ObjectId } from 'mongodb';
import { MongoService } from '../services/mongo.service'; // Import MongoService
import { ChatMsg } from '../types';

export class ChatModel {
  private mongoService: MongoService<ChatMsg> = new MongoService<ChatMsg>(
    'chatMessages'
  );

  /**
   * Save a new message from the user or AI.
   * @param message - The message object containing userId, sender, content, and timestamp.
   */
  async saveMessage(
    message: ChatMsg
  ): Promise<{ acknowledged: boolean; insertedId: ObjectId }> {
    return this.mongoService.create(message);
  }

  /**
   * Fetch recent messages for a user.
   * @param userId - The ID of the user.
   * @param limit - Number of recent messages to fetch. Default is 50.
   */
  async getRecentMessages(
    userId: string | ObjectId,
    limit = 50
  ): Promise<ChatMsg[]> {
    const query = { userId: new ObjectId(userId) };
    return this.mongoService.find(query, { sort: { timestamp: -1 }, limit });
  }

  /**
   * Fetch all messages for a user.
   * @param userId - The ID of the user.
   */
  async getMessages(userId: string | ObjectId): Promise<ChatMsg[]> {
    const query = { userId: new ObjectId(userId) };
    return this.mongoService.find(query, { sort: { timestamp: -1 } });
  }

  /**
   * Fetch messages for a user within a specific date range.
   * @param userId - The ID of the user.
   * @param startDate - Start date for the range.
   * @param endDate - End date for the range.
   */
  async getMessagesByDateRange(
    userId: string | ObjectId,
    startDate: Date,
    endDate: Date
  ): Promise<ChatMsg[]> {
    const query = {
      userId: new ObjectId(userId),
      timestamp: { $gte: startDate, $lte: endDate },
    };
    return this.mongoService.find(query, { sort: { timestamp: 1 } });
  }
}
