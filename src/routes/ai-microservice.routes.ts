import express, { Router, Request, Response, NextFunction } from 'express';
import { AiMicroserviceController } from '../controllers';
import { AiProfile, UserProfile } from '../types';

export class AiMicroserviceRoutes {
  private router: Router = express.Router();
  private microserviceCtrl = new AiMicroserviceController();

  constructor() {
    this.initializeRoutes();
  }

  public getRouter = () => {
    return this.router;
  };

  // NOTE: Estas rutas no las estoy usando desde la app.
  // Las que soy usando son las de coach.routes.ts
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

  private initUserPreferences = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { userProfile }: { userProfile: UserProfile } = req.body;
    try {
      if (!userProfile) {
        throw new Error('no userProfile');
      }
      console.log('llega user profile', userProfile);
      const { _id, email, password, ...aiProfile } = userProfile;
      const state = await this.microserviceCtrl.initStatePreferences(
        userProfile._id as string,
        aiProfile
      );
      res.status(200).json(state);
    } catch (error: unknown) {
      next(error);
    }
  };
}
