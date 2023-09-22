import express, { Router, Request, Response } from 'express';
import { AiController } from '../controllers';

export class CoachRoutes {
  private router: Router = express.Router();
  private aiController: AiController;

  constructor() {
    this.initializeRoutes();
    this.aiController = new AiController();
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
    const { message } = req.body;
    try {
      if (!message && typeof message !== 'string') {
        throw new Error('message is not a string');
      }
      const answer = await this.aiController.coachResponse(message);
      res.status(200).json({ answer });
    } catch (error) {
      console.log(error);
      res.status(500).send('Internal server error');
    }
  };
}
