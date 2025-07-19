import express, { Router, Request, Response, NextFunction } from 'express';
import { UserController } from '../controllers';
import { RegistrationData, UserProfile } from '../types';

export class UserRoutes {
  private router: Router = express.Router();
  userController: UserController = new UserController();

  constructor() {
    this.initializeRoutes();
    // this.userController = new UserController();
  }

  private initializeRoutes(): void {
    // this.router.post('/signup', this.signUp);
    this.router.post('/login', this.login);
    this.router.post('/register', this.register);
    this.router.post('/refreshToken', this.refreshToken);
    this.router.post('/getUserById', this.getUserByID);
    this.router.post('/calculatePlan', this.calculatePlan);
  }

  public getRouter(): Router {
    return this.router;
  }

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user } = req.body as { user: UserProfile };
      console.log('me llega este user', user);
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

  // signUp = async (req: Request, res: Response, next: NextFunction) => {
  //   try {
  //     const { registrationData } = req.body as {
  //       registrationData: RegistrationData;
  //     };
  //     console.log('esto es lo que llega', registrationData);
  //     const userData = await this.userController.signUp(
  //       registrationData.email,
  //       registrationData.password,
  //       registrationData
  //     );
  //     res.status(200).send({
  //       auth: true,
  //       user: userData.user,
  //       token: userData.token,
  //       refreshToken: userData.refreshToken,
  //     });
  //   } catch (error: unknown) {
  //     next(error);
  //   }
  // };

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
    console.log('me llega esta userd data:', userData);
    try {
      const plan = this.userController.calculatePlan(userData);
      res.status(200).json(plan);
    } catch (error: unknown) {
      next(error);
    }
  };
}
