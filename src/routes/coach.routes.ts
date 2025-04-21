import express, { Router, Request, Response, NextFunction } from 'express';
import { CoachController } from '../controllers';
import { AiAgent, FatSecretService } from './../services';
import multer from 'multer';

interface MulterRequest extends Request {
  file: Express.Multer.File;
}

export class CoachRoutes {
  private router: Router = express.Router();
  private aiController: CoachController;
  private aiAgent: AiAgent;
  private fatSecretSc: FatSecretService;
  private upload = multer();

  constructor() {
    this.initializeRoutes();
    this.aiController = new CoachController();
    this.aiAgent = new AiAgent();
    this.fatSecretSc = new FatSecretService();
  }

  private initializeRoutes = () => {
    this.router.get('/', this.testCoach);
    this.router.post('/get-answer', this.coachAnswer);
    this.router.post(
      '/parse-image',
      this.upload.single('image'),
      this.parseImage
    );
    this.router.get('/getFood', this.getFood);
    this.router.get('/lcel-agent', this.lcelAnswer);
  };

  public getRouter = () => {
    return this.router;
  };

  private testCoach = (req: Request, res: Response) =>
    res.send('Coach routes Ok');

  private coachAnswer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { message, userId } = req.body;
    console.log('coach answer input', message, userId);
    try {
      if (!message || !userId) {
        throw new Error('missing message or user ID');
      }
      if (typeof message !== 'string') {
        throw new Error('message is not a string');
      }
      const answer = await this.aiController.coachResponse(message, userId);
      res.status(200).json(answer);
    } catch (error: unknown) {
      next(error);
    }
  };

  private parseImage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      console.log(req.body);
      const userId = req.body.userId;
      const file = req.file;

      if (!userId) {
        throw new Error('Missing userId');
      }
      if (!file) {
        throw new Error('No image file');
      }

      console.log('Received image from user:', userId);
      console.log('Image type:', file.mimetype);
      console.log('Image size:', file.size, 'bytes');

      // 👇 Use the imageBase64 or imageUrl with your AI tool
      const answer = await this.aiController.parseImage(file, userId);

      res.status(200).json(answer);
    } catch (error: unknown) {
      next(error);
    }
  };

  private getFood = async (req: Request, res: Response, next: NextFunction) => {
    console.log('llega get food');
    try {
      const query = req.query.q as string;
      console.log(query);
      const results = await this.fatSecretSc.searchFoods(query);
      res.json(results);
    } catch (error: unknown) {
      next(error);
    }
  };

  private lcelAnswer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // const answer = await this.aiAgent.buildInitAgentEx();
      const answer = await this.aiAgent.buildChatAgentLCEL();
      res.status(200).json(answer);
    } catch (error) {
      next(error);
    }
  };
}
