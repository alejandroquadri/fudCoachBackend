import express, { Router, Request, Response, NextFunction } from 'express';
import { UserController } from '../controllers';
import { RegistrationData } from '../types';

export class UserRoutes {
  private router: Router = express.Router();
  userController: UserController = new UserController();

  constructor() {
    this.initializeRoutes();
    // this.userController = new UserController();
  }

  private initializeRoutes(): void {
    this.router.post('/signup', this.signUp);
    this.router.post('/login', this.login);
    this.router.post('/refreshToken', this.refreshToken);
    this.router.post('/getUserById', this.getUserByID);
    this.router.post('/add-food-mock', this.mockAddFood);
    this.router.post('/add-weight-mock', this.mockAddWeight);
  }

  public getRouter(): Router {
    return this.router;
  }

  private mockAddFood = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { meal_obj } = req.body;
    if (!meal_obj) {
      throw new Error('no food item');
    }
    console.log(meal_obj);
    res.status(200).json({ res: 'Food Added' });
  };

  private mockAddWeight = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { weight } = req.body;
    if (!weight) {
      throw new Error('no weight');
    }
    console.log(weight);
    res.status(200).json({ res: 'Weight Added' });
  };

  signUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // const { email, password, profile } = req.body;
      const { registrationData } = req.body as {
        registrationData: RegistrationData;
      };
      console.log('esto es lo que llega', registrationData);
      const userData = await this.userController.signUp(
        registrationData.email,
        registrationData.password,
        registrationData
      );
      res.status(200).send({
        auth: true,
        user: userData.user,
        token: userData.token,
        refreshToken: userData.refreshToken,
      });
    } catch (error: unknown) {
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
}
