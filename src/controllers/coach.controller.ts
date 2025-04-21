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

      return aiChatMsg;
    } catch (error) {
      console.log('Error parsing Image', error);
      throw new Error('Error parsing Image');
    }
  }

  // async parseImageViejo(
  //   file: Express.Multer.File,
  //   userId: string
  // ): Promise<ChatMsg> {
  //   // 1. Save the image to disk
  //   const uploadDir = path.join(__dirname, '../../uploads');
  //   if (!fs.existsSync(uploadDir)) {
  //     fs.mkdirSync(uploadDir);
  //   }
  //
  //   const fileName = `${userId}-${Date.now()}.jpg`;
  //   const filePath = path.join(uploadDir, fileName);
  //   fs.writeFileSync(filePath, file.buffer);
  //
  //   // 2. Build the public URL to access it
  //   const imageUrl = `http://localhost:3000/uploads/${fileName}`;
  //
  //   // 3. Create prompt or send imageUrl to the Python service
  //   const mes = `I ate this ${imageUrl}`;
  //   const aiAnswer = await this.microserviceCtrl.getAiResponse(mes, userId);
  //   const aiChatMsg = this.buildUserMsg(aiAnswer.response, userId, 'ai');
  //   console.log(aiChatMsg);
  //   return aiChatMsg;
  // }

  //     file: Express.Multer.File,
  //     userId: string
  //   ): Promise<ChatMsg> {
  //     const imageBase64 = file.buffer.toString('base64');
  //     const imageMime = file.mimetype;
  //
  //     const imageUrl = `data:${imageMime};base64,${imageBase64}`;
  //     const mes = `I ate this ${imageUrl}`;
  //     const aiAnswer = await this.microserviceCtrl.getAiResponse(mes, userId);
  //     const aiChatMsg = this.buildUserMsg(aiAnswer.response, userId, 'ai');
  //     console.log(aiChatMsg);
  //     return aiChatMsg;
  //   }

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

// async coachResponseViejo(message: string, userId: string): Promise<ChatMsg> {
//   console.log(message === 'New patient' || message === 'Greet the human');
//   if (!(message === 'New patient' || message === 'Greet the human')) {
//     console.log('voy a guardar mensajes');
//     // doy formato a los mensajes
//     const userChatMsg = this.buildUserMsg(message, userId, 'user');
//     // guardo el mensaje del usuario
//     await this.chatModel.saveMessage(userChatMsg);
//   }
//
//   const user = await this.userModel.getUserById(userId);
//   if (!user) {
//     throw new Error('No se encontró usuario');
//   }
//
//   // !Esto lo usaria si quiero dos ai disitntos para intro y el resto de las consultas comunes
//   // let response;
//   // if (user.completedQA) {
//   //   // pido respuesta al ai
//   //   response = await this.aiService
//   //     .getAiResponse(message, userId)
//   //     .catch(err => console.log('error en controlador', err));
//   // } else {
//   //   // pido respuesta al ai si no se ha completado QA
//   //   response = await this.aiService
//   //     .getAiIntroResponse(message, userId)
//   //     .catch(err => console.log('error en controlador', err));
//   // }
//
//   // pido respuesta al ai si no se ha completado QA
//   const response = await this.aiService
//     .getAiResponse(message, userId)
//     .catch(err => console.log('error en controlador', err));
//
//   // doy formato y guardo mensaje del ai
//   if (response) {
//     const aiChatMsg = this.buildUserMsg(response.output, userId, 'ai');
//     await this.chatModel.saveMessage(aiChatMsg);
//     return aiChatMsg;
//   } else {
//     throw new Error('Error obteniendo respuesta de ai');
//   }
// }
