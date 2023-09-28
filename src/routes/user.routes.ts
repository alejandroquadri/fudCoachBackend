import express, { Router, Request, Response, NextFunction } from 'express';
import { UserController } from '../controllers';

export class UserRoutes {
  private router: Router = express.Router();
  userController: UserController;

  constructor() {
    this.initializeRoutes();
    this.userController = new UserController();
  }

  private initializeRoutes(): void {
    this.router.post('/signup', this.signUp);
    this.router.post('/login', this.login);
    this.router.post('/refreshToken', this.refreshToken);
    this.router.post('/getUserById', this.getUserByID);
  }

  public getRouter(): Router {
    return this.router;
  }

  signUp = async (req: Request, res: Response) => {
    try {
      const { email, name, password } = req.body;

      const user = await this.userController.signUp(email, name, password);
      if (typeof user === 'string' && user === 'email taken') {
        throw new Error(user);
      } else {
        res.status(200).send(user);
      }
    } catch (error: unknown) {
      console.log('el error es', error);
      const errorDesc =
        error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: errorDesc });
    }
  };

  login = async (req: Request, res: Response) => {
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
      console.log('el error es', error);
      const errorDesc =
        error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: errorDesc });
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
        accessToken: userData.accessToken,
        refreshToken: userData.refreshToken, // Optionally send a new refresh token
      });
    } catch (error: unknown) {
      next(error);
    }
  };

  getUserByID = async (req: Request, res: Response) => {
    const { id } = req.body;
    try {
      const user = await this.userController.getUserById(id);
      res.status(200).json({ user });
    } catch (error: unknown) {
      const errorDesc =
        error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: errorDesc });
    }
  };
}
