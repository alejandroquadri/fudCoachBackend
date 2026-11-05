import { languageFrom } from '../services/ai/language';
import express, { Router, Request, Response, NextFunction } from 'express';
import { CoachController, toAiProfile, UserController } from '../controllers';
import { FatSecretService } from './../services';
import multer from 'multer';
import { z } from 'zod';
import { BarcodeError, BarcodeService } from '../services/barcode.service';
import { aiAgentService } from '../services';
import { UserProfile } from '../types';
import {
  PageRequestSchema,
  decodeCursor,
} from '../services/ai/chat-pagination';
import {
  bytes,
  ContextBudgetError,
  MAX_USER_MESSAGE_BYTES,
} from '../services/ai/ai-context';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export class CoachRoutes {
  private router: Router = express.Router();
  private coachCtrl: CoachController = new CoachController();
  private userCtrl: UserController = new UserController();
  private fatSecretSc: FatSecretService = new FatSecretService();
  private barcode = new BarcodeService();

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
    this.router.post('/get-messages-page', this.getMessagePage);
    this.router.post('/get-answer', this.coachAnswer);
    this.router.post('/barcode/lookup', this.lookupBarcode);
    this.router.post('/barcode/log', this.logBarcode);
    this.router.post('/reset-conversation', this.resetConversation);
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

  private lookupBarcode = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      this.authenticatedUserId(req);
      if (typeof req.body.barcode !== 'string')
        throw new BarcodeError('invalid');
      res.json(await this.barcode.lookup(req.body.barcode));
    } catch (error) {
      this.barcodeError(error, res, next);
    }
  };

  private logBarcode = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = this.authenticatedUserId(req);
      const parsed = z
        .object({
          barcode: z.string(),
          grams: z.number().positive().max(10000),
          version: z.string().regex(/^[a-f0-9]{64}$/),
          clientRequestId: z.string().uuid(),
          note: z.string().max(1000).optional().default(''),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new BarcodeError('invalid');
      const { barcode, grams, version, clientRequestId, note } = parsed.data;
      const product = await this.barcode.lookup(barcode);
      if (product.version !== version) throw new BarcodeError('changed');
      const meal = this.barcode.meal(product, grams);
      const answer = await aiAgentService.respond({
        userId,
        clientRequestId,
        message: `Log ${meal.serving_size} of ${
          meal.name
        } (barcode ${barcode}).${note.trim() ? ` ${note.trim()}` : ''}`,
        barcodeMeal: meal,
        language: languageFrom(req.header('X-App-Language')),
      });
      res.json(answer);
    } catch (error) {
      this.barcodeError(error, res, next);
    }
  };

  private barcodeError(error: unknown, res: Response, next: NextFunction) {
    if (!(error instanceof BarcodeError)) return next(error);
    const statuses = {
      invalid: 400,
      not_found: 404,
      incomplete: 422,
      unavailable: 503,
      changed: 409,
    };
    res.status(statuses[error.code]).json({ code: error.code });
  }

  private getWelcomeMes = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = this.authenticatedUserId(req);
      const user = req.user as UserProfile;
      const welcomeMes = await this.coachCtrl.getWelcomeMes(userId, languageFrom(req.header('X-App-Language')) ?? user.language ?? 'en');
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
    try {
      const userId = this.authenticatedUserId(req);
      const userPreferences = { _id: userId, deliveredWelcome: true };

      await this.userCtrl.updateProfileForUser(userId, userPreferences);
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
    try {
      const currentUser = req.user as UserProfile;
      const userId = this.authenticatedUserId(req);
      const aiProfile = toAiProfile(currentUser);
      const state = await this.coachCtrl.initUserPreferences(userId, aiProfile);
      res.status(200).json(state);
    } catch (error: unknown) {
      next(error);
    }
  };

  getMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = this.authenticatedUserId(req);
      const messages = await this.coachCtrl.getMessages(userId);
      res.status(200).json(messages);
    } catch (error: unknown) {
      next(error);
    }
  };

  private getMessagePage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const options = PageRequestSchema.safeParse(req.body);
    if (!options.success) {
      res.status(400).json({ message: 'Invalid chat page options' });
      return;
    }
    try {
      if (options.data.before) decodeCursor(options.data.before);
    } catch {
      res.status(400).json({ message: 'Invalid chat cursor' });
      return;
    }
    try {
      res.json(
        await this.coachCtrl.getMessagePage(
          this.authenticatedUserId(req),
          options.data
        )
      );
    } catch (error) {
      next(error);
    }
  };

  private coachAnswer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { message, clientRequestId, timeZone } = req.body;
    try {
      const userId = this.authenticatedUserId(req);
      if (!message) throw new Error('missing message');
      if (typeof message !== 'string') {
        throw new Error('message is not a string');
      }
      if (bytes(message) > MAX_USER_MESSAGE_BYTES) {
        res.status(413).json({
          message: 'Message too long. Please split it into shorter messages.',
        });
        return;
      }
      const answer = await this.coachCtrl.coachResponse(
        message,
        userId,
        typeof clientRequestId === 'string' ? clientRequestId : undefined,
        typeof timeZone === 'string' ? timeZone : undefined,
        languageFrom(req.header('X-App-Language'))
      );
      res.status(200).json(answer);
    } catch (error: unknown) {
      if (error instanceof ContextBudgetError) {
        res.status(413).json({ message: error.message });
        return;
      }
      next(error);
    }
  };

  private parseImage = async (
    req: MulterRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = this.authenticatedUserId(req);
      const file = req.file;
      if (
        typeof req.body.message === 'string' &&
        bytes(req.body.message) > MAX_USER_MESSAGE_BYTES
      ) {
        res
          .status(413)
          .json({ message: 'Photo caption too long. Please shorten it.' });
        return;
      }

      if (!file) {
        throw new Error('No image file');
      }

      const clientRequestId =
        typeof req.body.clientRequestId === 'string'
          ? req.body.clientRequestId
          : undefined;
      const answer = await this.coachCtrl.parseImage(
        file,
        userId,
        clientRequestId,
        typeof req.body.message === 'string' ? req.body.message : undefined,
        languageFrom(req.header('X-App-Language'))
      );
      res.status(200).json(answer);
    } catch (error: unknown) {
      if (error instanceof ContextBudgetError) {
        res.status(413).json({ message: error.message });
        return;
      }
      next(error);
    }
  };

  private resetConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const result = await this.coachCtrl.resetConversation(
        this.authenticatedUserId(req)
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  private authenticatedUserId(req: Request) {
    const currentUser = req.user as UserProfile | undefined;
    if (!currentUser?._id) throw new Error('Authenticated user has no ID');
    const userId = String(currentUser._id);
    const suppliedUserId = req.body?.userId;
    if (suppliedUserId && String(suppliedUserId) !== userId) {
      throw new Error(
        'The supplied user ID does not match the authenticated user'
      );
    }
    return userId;
  }

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
