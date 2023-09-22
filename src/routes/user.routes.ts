import express, { Router, Request, Response } from 'express';
import { UserController } from '../controllers';
import { UserModel } from '../models';

export class UserRoutes {
  private router: Router = express.Router();
  userController: UserController;
  userModel: UserModel;

  constructor() {
    this.initializeRoutes();
    this.userController = new UserController();
    this.userModel = new UserModel();
  }

  private initializeRoutes(): void {
    this.router.post('/signup', this.signUp);
    this.router.post('/login', this.login);
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
        res
          .status(200)
          .send({ auth: true, user: userData.user, token: userData.token });
      }
    } catch (error: unknown) {
      console.log('el error es', error);
      const errorDesc =
        error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: errorDesc });
    }
  };

  getUserByID = async (req: Request, res: Response) => {
    const { id } = req.body;
    try {
      const user = await this.userModel.getUserById(id);
      console.log(user);
      res.status(200).json({ user });
    } catch (error: unknown) {
      console.log('el error es', error);
      const errorDesc =
        error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: errorDesc });
    }
  };
}
