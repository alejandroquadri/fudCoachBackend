import { ChatModel } from '../models';

export class ChatController {
  chatModel: ChatModel;

  constructor() {
    this.chatModel = new ChatModel();
  }

  getMessages = (userId: string) => {
    return this.chatModel.getMessages(userId);
  };
}
