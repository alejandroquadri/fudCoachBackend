import express, { NextFunction, Request, Response, Router } from 'express';
import { UserController } from '../controllers/user.controller';

export class ProfileRoutes {
  private router: Router = express.Router();
  private userController: UserController = new UserController();

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
  };

  private test = (req: Request, res: Response) => res.send('Profile routes Ok');

  private getUser = async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.body;
    try {
      if (!id) {
        throw new Error('no id');
      }
      const user = await this.userController.getUserById(id);
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
      const ret = await this.userController.updateUser(user);
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
    const { id } = req.body;
    try {
      if (!id) throw new Error('no id');
      await this.userController.deleteUser(id);
      res.status(200).json({ success: true });
    } catch (error: unknown) {
      next(error);
    }
  };
}
