import express, { Router, Request, Response } from 'express';
import { CoachController } from '../controllers';

export class CoachRoutes {
  private router: Router = express.Router();
  private aiController: CoachController;

  constructor() {
    this.initializeRoutes();
    this.aiController = new CoachController();
  }

  private initializeRoutes = () => {
    this.router.get('/', this.testCoach);
    this.router.post('/getAnswer', this.coachAnswer);
  };

  public getRouter = () => {
    return this.router;
  };

  private testCoach = (req: Request, res: Response) =>
    res.send('Coach routes Ok');

  private coachAnswer = async (req: Request, res: Response) => {
    const { message, userId, chatHistory } = req.body;
    try {
      if (!message || !userId) {
        throw new Error('missing message or user ID');
      }
      if (typeof message !== 'string') {
        throw new Error('message is not a string');
      }
      const answer = await this.aiController.coachResponse(
        message,
        userId,
        chatHistory
      );
      res.status(200).json(answer);
    } catch (error: unknown) {
      const errorDesc =
        error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: errorDesc });
    }
  };
}
