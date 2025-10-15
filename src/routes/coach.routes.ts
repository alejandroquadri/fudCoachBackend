import express, { Router, Request, Response, NextFunction } from 'express';
import { CoachController, UserController } from '../controllers';
import { FatSecretService } from './../services';
import multer from 'multer';
import { UserProfile } from '../types';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export class CoachRoutes {
  private router: Router = express.Router();
  private coachCtrl: CoachController = new CoachController();
  private userCtrl: UserController = new UserController();
  private fatSecretSc: FatSecretService = new FatSecretService();

  // Use memoryStorage so we get file.buffer directly
  private upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB cap, adjust as needed
    fileFilter: (_req, file, cb) => {
      const ok = /^image\/(jpe?g|png|heic|webp)$/i.test(file.mimetype);
      if (!ok) return cb(new Error('Only image uploads are allowed'));
      cb(null, true);
    },
  });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes = () => {
    this.router.get('/', this.testCoach);
    this.router.post('/init-user-preferences', this.initUserPreferences);
    this.router.post('/get-welcome', this.getWelcomeMes);
    this.router.post('/mark-welcome-delivered', this.markWelcomeDelivered);
    this.router.post('/get-messages', this.getMessages);
    this.router.post('/get-answer', this.coachAnswer);
    this.router.post(
      '/parse-image',
      this.upload.single('image'),
      this.parseImage
    );
    this.router.get('/getFood', this.getFood);
  };

  public getRouter = () => {
    return this.router;
  };

  private testCoach = (req: Request, res: Response) =>
    res.send('Coach routes Ok');

  private getWelcomeMes = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { userId } = req.body;
    try {
      const welcomeMes = await this.coachCtrl.getWelcomeMes(userId);
      res.status(200).json(welcomeMes);
    } catch (error) {
      next(error);
    }
  };

  private markWelcomeDelivered = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { userId } = req.body;
    try {
      const userPreferences = { _id: userId, deliveredWelcome: true };

      await this.userCtrl.updateUser(userPreferences);
      res.status(200).json({ res: 'updated' });
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
      const { _id, email, password, ...aiProfile } = userProfile;
      const state = await this.coachCtrl.initUserPreferences(
        userProfile._id as string,
        aiProfile
      );
      res.status(200).json(state);
    } catch (error: unknown) {
      next(error);
    }
  };

  getMessages = async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.body;
    console.log('llega a getMsgs', userId);
    try {
      if (!userId) {
        throw new Error('no user id');
      }
      console.log('pido mensajes');
      const messages = await this.coachCtrl.getMessages(userId);
      res.status(200).json(messages);
    } catch (error: unknown) {
      next(error);
    }
  };

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
      const answer = await this.coachCtrl.coachResponse(message, userId);
      res.status(200).json(answer);
    } catch (error: unknown) {
      next(error);
    }
  };

  private parseImage = async (
    req: MulterRequest,
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
      console.log('Image size:', file.size);

      // 👇 Use the imageBase64 or imageUrl with your AI tool
      const answer = await this.coachCtrl.parseImage(file, userId);
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
}
