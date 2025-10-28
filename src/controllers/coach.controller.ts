import { AiProfile, ChatMsg } from '../types';
import { ObjectId } from 'mongodb';
import { ChatModel, UserModel } from '../models';
import { AiMicroserviceController } from './ai-microservice.controller';
import sharp from 'sharp';

export class CoachController {
  chatModel: ChatModel = new ChatModel();
  userModel: UserModel = new UserModel();
  microserviceCtrl: AiMicroserviceController = new AiMicroserviceController();

  async initUserPreferences(userId: string, preferences: AiProfile) {
    try {
      return this.microserviceCtrl.initStatePreferences(userId, preferences);
    } catch (error) {
      throw new Error(`Error inicializando preferencias: ${error}`);
    }
  }

  async getWelcomeMes(userId: string) {
    const mes = `Hi! I'm your personal dietitian 🤖🥗

I'm here for you 24/7, all year round — to help you stay accountable and reach your nutrition goals.

You can share your meals with me through text or photos. I’ll automatically estimate their calories and macronutrients, and log them for you. You can also record your weight, and I’ll create a clean, easy-to-read chart so you can track your progress.

Have any nutrition questions? Just ask. I can also help you design personalized meal plans based on your preferences — and I’ll remember what you like (and what you don’t).

Most importantly, I’m here to support you every step of the way on this journey.

Let’s get started — are you ready? 💪`;

    const resp = await this.microserviceCtrl.appendAiMessage(userId, mes);
    const aiWelcomeMsg = this.buildUserMsg(mes, userId, 'ai');

    // guardo mensaje de bienvenida como primer mensage
    await this.chatModel.saveMessage(aiWelcomeMsg);
    return aiWelcomeMsg;
  }

  getMessages = (userId: string) => {
    return this.chatModel.getMessages(userId);
  };

  async coachResponse(message: string, userId: string): Promise<ChatMsg> {
    try {
      const user = await this.userModel.getUserById(userId);
      if (!user) {
        throw new Error('No se encontró usuario');
      }

      // pido respuesta al ai si no se ha completado QA

      const aiAnswer = await this.microserviceCtrl.getAiResponse(
        message,
        userId
      );
      // salvo mensage de usuario
      const userMsg = this.buildUserMsg(message, userId, 'user');
      await this.chatModel.saveMessage(userMsg);
      // salvo mensaje de ai
      const aiChatMsg = this.buildUserMsg(aiAnswer.response, userId, 'ai');
      await this.chatModel.saveMessage(aiChatMsg);
      return aiChatMsg;
    } catch (error) {
      throw new Error(`Error obteniendo respuesta de ai ${error}`);
    }
  }

  async parseImage(
    file: Express.Multer.File,
    userId: string
  ): Promise<ChatMsg> {
    try {
      const processed = await sharp(file.buffer).rotate().toBuffer();

      const aiAnswer = await this.microserviceCtrl.parseImage(
        userId,
        processed
      );
      console.log('respuesta de parsing img', aiAnswer.response);
      const aiChatMsg = this.buildUserMsg(aiAnswer.response, userId, 'ai');

      return aiChatMsg;
    } catch (error) {
      console.log('Error parsing Image', error);
      throw new Error('Error parsing Image');
    }
  }

  private buildUserMsg(
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
