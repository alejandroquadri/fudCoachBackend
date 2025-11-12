import express, { NextFunction, Request, Response, Router } from 'express';

import { UserController } from '../controllers';
import { UserProfile } from '../types';

export class UserRoutes {
  private router: Router = express.Router();
  userController: UserController = new UserController();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // this.router.post('/signup', this.signUp);
    this.router.post('/login', this.login);
    this.router.post('/register', this.register);
    this.router.post('/refresh-token', this.refreshToken);
    this.router.post('/get-user-by-id', this.getUserByID);
    this.router.post('/login-apple', this.loginApple);
    this.router.post('/calculate-plan', this.calculatePlan);
    this.router.post('/grant', this.grant);
  }

  public getRouter(): Router {
    return this.router;
  }

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user } = req.body as { user: UserProfile };
      const userData = await this.userController.register(user);
      res.status(200).send({
        auth: true,
        user: userData.user,
        token: userData.token,
        refreshToken: userData.refreshToken,
      });
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const userData = await this.userController.login(email, password);
      if (userData === 'not_found') {
        throw new Error('User not found');
      }
      if (userData === 'invalid_credentials') {
        throw new Error('Invalid redentials');
      }
      if (typeof userData !== 'string') {
        res.status(200).send({
          auth: true,
          user: userData.user,
          token: userData.token,
          refreshToken: userData.refreshToken,
        });
      }
    } catch (error: unknown) {
      next(error);
    }
  };

  loginApple = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { idToken, register, userData } = req.body as {
        idToken: string;
        register: boolean;
        userData?: Partial<UserProfile>;
      };
      if (!idToken) {
        return res.status(400).json({ error: 'idToken is required' });
      }

      const { user, token, refreshToken } =
        await this.userController.loginApple(idToken, register, userData);

      res.status(200).json({ auth: true, user, token, refreshToken });
    } catch (err) {
      next(err);
    }
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        throw new Error('Refresh token is required!');
      }

      const userData = await this.userController.refreshAccessToken(
        refreshToken
      );
      if (userData === 'token_invalid') {
        throw new Error('Invalid refresh token');
      }

      res.status(200).send({
        accessToken: userData.token,
        refreshToken: userData.refreshToken, // Optionally send a new refresh token
      });
    } catch (error: unknown) {
      next(error);
    }
  };

  getUserByID = async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.body;
    console.log('llega este id', id);
    try {
      const user = await this.userController.getUserById(id);
      res.status(200).json({ user });
    } catch (error: unknown) {
      next(error);
    }
  };

  calculatePlan = (req: Request, res: Response, next: NextFunction) => {
    const { userData } = req.body;
    try {
      const plan = this.userController.calculatePlan(userData);
      res.status(200).json(plan);
    } catch (error: unknown) {
      next(error);
    }
  };

  grant = async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.body;
    try {
      if (!userId) {
        throw new Error('no user id');
      }
      const obj: Partial<UserProfile> = {
        _id: userId,
        entitlement: {
          active: true,
          productId: 'manual',
          originalTransactionId: 'manual',
          platform: 'ios',
          grant: { type: 'test', untilISO: '2026-01-01T00:00:00Z' },
        },
      };
      console.log('user que mando', obj);
      const ret = await this.userController.updateUser(obj);
      res.status(200).json(ret);
    } catch (error: unknown) {
      next(error);
    }
  };
}
