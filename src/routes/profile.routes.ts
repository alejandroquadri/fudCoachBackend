import { languageFrom } from '../services/ai/language';
import express, { NextFunction, Request, Response, Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { UserProfile } from '../types';
import { CoachMemoryModel } from '../models/coach-memory.model';
import { MemoryEditSchema } from '../services/ai/coach-memory';
import { UserModel } from '../models';

export class ProfileRoutes {
  private router: Router = express.Router();
  private userController: UserController = new UserController();
  private memory = new CoachMemoryModel();

  constructor() {
    this.initializeRoutes();
  }

  public getRouter = () => {
    return this.router;
  };

  private initializeRoutes = () => {
    this.router.get('/', this.test);
    this.router.post('/get', this.getUser);
    this.router.post('/update', this.updateProfile);
    this.router.post('/delete', this.deleteUser);
    this.router.get('/memory', this.getMemory);
    this.router.put('/memory', this.editMemory);
    this.router.put('/language', this.updateLanguage);
  };

  private updateLanguage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as UserProfile;
      if (!user._id) throw new Error('Authenticated user has no ID');
      if (!languageFrom(req.body.language)) {
        res.status(400).json({ message: 'Unsupported language' });
        return;
      }
      await new UserModel().editUser({ _id: user._id, language: req.body.language });
      res.json({ language: req.body.language });
    } catch (error) { next(error); }
  };

  private test = (req: Request, res: Response) => res.send('Profile routes Ok');

  private getMemory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = req.user as UserProfile;
      if (!user._id) throw new Error('Authenticated user has no ID');
      res.json(await this.memory.get(String(user._id)));
    } catch (error) {
      next(error);
    }
  };

  private editMemory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const parsed = MemoryEditSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({
          message:
            'Provide all four memory sections (up to 2000 characters each) and the current revision.',
        });
      return;
    }
    try {
      const user = req.user as UserProfile;
      if (!user._id) throw new Error('Authenticated user has no ID');
      const { revision, ...sections } = parsed.data;
      const saved = await this.memory.save(
        String(user._id),
        sections,
        revision,
        'user'
      );
      if (!saved) {
        res
          .status(409)
          .json({
            message: 'Your coach memory changed. Reload it before saving.',
          });
        return;
      }
      res.json(saved);
    } catch (error) {
      next(error);
    }
  };

  private getUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUser = req.user as UserProfile;
      if (!currentUser._id) throw new Error('Authenticated user has no ID');
      const user = await this.userController.getPublicUserById(currentUser._id);
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  };

  private updateProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { user } = req.body;
    try {
      if (!user) {
        throw new Error('no user object');
      }
      const currentUser = req.user as UserProfile;
      if (!currentUser._id) throw new Error('Authenticated user has no ID');
      const ret = await this.userController.updateProfileForUser(
        currentUser._id,
        user
      );
      res.status(200).json(ret);
    } catch (error: unknown) {
      next(error);
    }
  };

  private deleteUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const currentUser = req.user as UserProfile;
      await this.userController.deleteUser(String(currentUser._id));
      res.status(200).json({ success: true });
    } catch (error: unknown) {
      next(error);
    }
  };
}
