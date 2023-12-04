import { ChatMsg } from '../types';
import { AiService } from '../services';
import { ObjectId } from 'mongodb';
import { ChatModel } from '../models';

export class CoachController {
  aiService: AiService;
  chatModel: ChatModel;

  constructor() {
    this.aiService = new AiService();
    this.chatModel = new ChatModel();
  }

  coachResponse = async (message: string, userId: string): Promise<ChatMsg> => {
    console.log('comienzo con respuesta del ai');
    const userChatMsg = this.buildUserMsg(message, userId, 'user');
    const userInsertResult = await this.chatModel.saveMessage(userChatMsg);
    console.log(
      'respuesta despues de guardar user chat mes en coach controller:',
      userInsertResult
    );
    console.log('pido respuesta al ai');
    const response = await this.aiService
      .getCustomAiResponse(message, userId)
      .catch(err => console.log(err));
    console.log('respuesta del ai', response?.output);
    const aiChatMsg = this.buildUserMsg(response!.output, userId, 'ai');
    const aiInsertResult = await this.chatModel.saveMessage(aiChatMsg);
    console.log(
      'respuesta despues de guardar ai chat mes en coach controller:',
      aiInsertResult
    );
    return aiChatMsg;
  };

  buildUserMsg(
    content: string,
    userId: string,
    sender: 'ai' | 'user'
  ): ChatMsg {
    return {
      userId: new ObjectId(userId),
      sender,
      content,
      timestamp: new Date(),
    };
  }
}
