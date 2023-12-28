import { mongoInstance } from '../connection';
import { ObjectId, WithId } from 'mongodb';
import { ChatMsg } from './../types';

export class ChatModel {
  collectionName = 'chatMessages';
  /**
   * Save a new message from the user or AI.
   * @param message - The message object containing userId, sender, content, and timestamp.
   */
  saveMessage = async (message: ChatMsg): Promise<unknown> => {
    return mongoInstance.db.collection(this.collectionName).insertOne(message);
  };

  /**
   * Fetch recent messages for a user.
   * @param userId - The ID of the user.
   * @param limit - Number of recent messages to fetch. Default is 50.
   */
  getRecentMessages = async (
    userId: string | ObjectId,
    limit = 50
  ): Promise<ChatMsg[]> => {
    return mongoInstance.db
      .collection<ChatMsg>(this.collectionName)
      .find({ userId: new ObjectId(userId) })
      .sort({ timestamp: -1 }) // Sort by most recent messages
      .limit(limit)
      .toArray();
  };

  /**
   * Fetch recent messages for a user.
   * @param userId - The ID of the user.
   */
  getMessages = async (userId: string | ObjectId): Promise<ChatMsg[]> => {
    return mongoInstance.db
      .collection<ChatMsg>(this.collectionName)
      .find({ userId: new ObjectId(userId) })
      .sort({ timestamp: -1 }) // Sort by most recent messages
      .toArray();
  };

  /**
   * Fetch messages for a user within a specific date range.
   * @param userId - The ID of the user.
   * @param startDate - Start date for the range.
   * @param endDate - End date for the range.
   */
  getMessagesByDateRange = async (
    userId: string | ObjectId,
    startDate: Date,
    endDate: Date
  ): Promise<ChatMsg[]> => {
    return mongoInstance.db
      .collection<ChatMsg>(this.collectionName)
      .find({
        userId: new ObjectId(userId),
        timestamp: { $gte: startDate, $lte: endDate },
      })
      .sort({ timestamp: 1 }) // Sort by oldest to newest
      .toArray();
  };
}
