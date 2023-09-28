import { ObjectId } from 'mongodb';
import { mongoInstance } from '../connection';

export class AiModel {
  saveChatHistory = async (chatHistory: unknown, userId: string | ObjectId) => {
    console.log(
      'desde ai model, intento guardar chat history',
      chatHistory,
      userId
    );
    return mongoInstance.db.collection('aiChatHistory').insertOne({
      _id: new ObjectId(userId),
      chatHistory,
    });
  };

  getChatHistory = (userId: string | ObjectId) => {
    return mongoInstance.db
      .collection('aiChatHistory')
      .findOne({ _id: new ObjectId(userId) });
  };
}
