import { ChatMsg } from '../types';
import { AiService } from '../services';
import { ObjectId } from 'mongodb';
import { ChatModel } from '../models';

export class CoachController {
  aiService: AiService;
  chatModel: ChatModel;
  mochMsgs: ChatMsg[] = [
    {
      sender: 'user',
      content: 'Hi! How Are you doing?',
    },
    {
      sender: 'ai',
      content: 'Hi! Fine. And you?',
    },
    {
      sender: 'user',
      content: 'Very well! Thank you',
    },
    {
      sender: 'ai',
      content: 'What is your name?',
    },
    {
      sender: 'user',
      content: 'My name is Alex',
    },
    {
      sender: 'ai',
      content: 'Where were you born?',
    },
    {
      sender: 'user',
      content: 'In Buenos Aires, Argentina',
    },
    {
      sender: 'ai',
      content: 'Oh! Beautiful city',
    },
  ];

  constructor() {
    this.aiService = new AiService();
    this.chatModel = new ChatModel();
  }

  coachResponse = async (
    message: string,
    userId: string,
    chatHistory?: ChatMsg[]
  ): Promise<ChatMsg> => {
    const userChatMsg = this.buildUserMsg(message, userId, 'user');
    const userInsertResult = await this.chatModel.saveMessage(userChatMsg);
    console.log(
      'respuesta despues de guardar user chat mes en coach controller:',
      userInsertResult
    );
    // console.log('este es el chat history que llega', chatHistory);
    const response = await this.aiService.getAiResponse(message, userId);
    const aiChatMsg = this.buildUserMsg(response.output, userId, 'ai');
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
