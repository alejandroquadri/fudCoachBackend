import express, { Router, Request, Response, NextFunction } from 'express';
import { AiMicroserviceController } from '../controllers';

export class AiMicroserviceRoutes {
  private router: Router = express.Router();
  private microserviceCtrl = new AiMicroserviceController();

  constructor() {
    this.initializeRoutes();
  }

  public getRouter = () => {
    return this.router;
  };

  private initializeRoutes(): void {
    this.router.get('/', this.test);
    this.router.post('/get-answer', this.getAiResponse);
    this.router.post('/init-user-preferences', this.initUserPreferences);
  }

  private test = (req: Request, res: Response) => res.send('ai routes Ok');

  private getAiResponse = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { prompt, userId } = req.body;
    try {
      if (!prompt) {
        throw new Error('no prompt');
      }
      if (!userId) {
        throw new Error('no user id');
      }
      const response = await this.microserviceCtrl.getAiResponse(
        prompt,
        userId
      );
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  private getMessages = (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.body;
    console.log('llega a getMsgs', userId);
    try {
      if (!userId) {
        throw new Error('no user id');
      }
      console.log('pido mensajes');
      const messages = this.microserviceCtrl.getMessages(userId);
      res.status(200).json(messages);
    } catch (error: unknown) {
      next(error);
    }
  };

  private initUserPreferences = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { userId, preferences } = req.body;
    try {
      if (!userId) {
        throw new Error('no user id');
      }
      if (!preferences) {
        throw new Error('no preferences');
      }
      const state = this.microserviceCtrl.initStatePreferences(
        userId,
        preferences
      );
      res.status(200).json(state);
    } catch (error: unknown) {
      next(error);
    }
  };
}
