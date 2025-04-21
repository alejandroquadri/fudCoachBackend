// import fs from 'fs';
// import path from 'path';
import { ChatMsg } from '../types';
import { ObjectId } from 'mongodb';
import { ChatModel, UserModel } from '../models';
import { AiMicroserviceController } from './ai-microservice.controller';
import { CloudinaryService } from '../services';

export class CoachController {
  chatModel: ChatModel = new ChatModel();
  userModel: UserModel = new UserModel();
  cloudinaryService: CloudinaryService = new CloudinaryService();
  microserviceCtrl: AiMicroserviceController = new AiMicroserviceController();

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
      // Upload to Cloudinary
      const filename = `${userId}-${Date.now()}`;
      const cloudinaryUrl = await this.cloudinaryService.uploadImageFromBuffer(
        file.buffer,
        filename
      );
      console.log('obtengo el url', cloudinaryUrl);

      // Build LLM prompt or direct call
      const mes = `I ate this ${cloudinaryUrl}`;
      const aiAnswer = await this.microserviceCtrl.getAiResponse(mes, userId);
      console.log('respuesta de parsing img', aiAnswer.response);
      const aiChatMsg = this.buildUserMsg(aiAnswer.response, userId, 'ai');

      // delete image once llm parsed it
      await this.cloudinaryService.deleteImage(filename);

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
