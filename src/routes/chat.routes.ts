import express, { Router, Request, Response, NextFunction } from 'express';
import { ChatController } from '../controllers';

export class ChatRoutes {
  private router: Router = express.Router();
  private chatController: ChatController;

  constructor() {
    this.initilizeRoutes();
    this.chatController = new ChatController();
  }

  private initilizeRoutes = () => {
    this.router.get('/', this.test);
    this.router.post('/get-messages', this.getMessages);
  };

  public getRouter = () => {
    return this.router;
  };

  private test = (req: Request, res: Response) =>
    res.send('chat routes really Ok');

  getMessages = async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.body;
    console.log('llega a getMsgs', userId);
    try {
      if (!userId) {
        throw new Error('no user id');
      }
      console.log('pido mensajes');
      const messages = await this.chatController.getMessages(userId);
      res.status(200).json(messages);
    } catch (error: unknown) {
      next(error);
    }
  };
}
