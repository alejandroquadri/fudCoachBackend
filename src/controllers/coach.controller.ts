import { ChatMsg } from '../types';
import { AiService } from '../services';
import { ObjectId } from 'mongodb';
import { ChatModel, UserModel } from '../models';

export class CoachController {
  aiService: AiService;
  chatModel: ChatModel;
  userModel: UserModel;

  constructor() {
    this.aiService = new AiService();
    this.chatModel = new ChatModel();
    this.userModel = new UserModel();
  }

  coachResponse = async (message: string, userId: string): Promise<ChatMsg> => {
    console.log(message === 'New patient' || message === 'Greet the human');
    if (!(message === 'New patient' || message === 'Greet the human')) {
      console.log('voy a guardar mensajes');
      // doy formato a los mensajes
      const userChatMsg = this.buildUserMsg(message, userId, 'user');
      // guardo el mensaje del usuario
      await this.chatModel.saveMessage(userChatMsg);
    }

    const user = await this.userModel.getUserById(userId);
    if (!user) {
      throw new Error('No se encontró usuario');
    }

    // !Esto lo usaria si quiero dos ai disitntos para intro y el resto de las consultas comunes
    // let response;
    // if (user.completedQA) {
    //   // pido respuesta al ai
    //   response = await this.aiService
    //     .getAiResponse(message, userId)
    //     .catch(err => console.log('error en controlador', err));
    // } else {
    //   // pido respuesta al ai si no se ha completado QA
    //   response = await this.aiService
    //     .getAiIntroResponse(message, userId)
    //     .catch(err => console.log('error en controlador', err));
    // }

    // pido respuesta al ai si no se ha completado QA
    const response = await this.aiService
      .getAiResponse(message, userId)
      .catch(err => console.log('error en controlador', err));

    // doy formato y guardo mensaje del ai
    if (response) {
      const aiChatMsg = this.buildUserMsg(response.output, userId, 'ai');
      await this.chatModel.saveMessage(aiChatMsg);
      return aiChatMsg;
    } else {
      throw new Error('Error obteniendo respuesta de ai');
    }
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
