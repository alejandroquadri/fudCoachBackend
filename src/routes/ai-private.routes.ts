import express, { NextFunction, Request, Response, Router } from 'express';
import {
  FoodLogsController,
  UserController,
  WeightLogsController,
} from '../controllers';
import { AiFoodLog, AiProfile } from '../types';

export class AiPrivateRoutes {
  private router: Router = express.Router();
  private foodLogsController: FoodLogsController = new FoodLogsController();
  private weightLogsController: WeightLogsController =
    new WeightLogsController();
  private userController: UserController = new UserController();

  constructor() {
    this.initilizeRoutes();
  }

  public getRouter(): Router {
    return this.router;
  }
  private initilizeRoutes() {
    this.router.get('/', this.test);
    this.router.post('/add-food-log', this.addFoodLog);
    this.router.post('/add-weight-log', this.addWeightLog);
    this.router.post('/update-preferences', this.updatePreferences);
  }

  private test = (_req: Request, res: Response) =>
    res.send('private ai routes Ok');

  private addFoodLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { meal_obj, user_id }: { meal_obj: AiFoodLog[]; user_id: string } =
      req.body;
    try {
      if (!meal_obj) {
        throw new Error('no food item');
      }
      if (!user_id) {
        throw new Error('no user id');
      }

      const results = await this.foodLogsController.createAiFoodLog(
        meal_obj,
        user_id
      );
      console.log(meal_obj, results);
      res.status(200).json({ res: 'Food Added' });
    } catch (error) {
      next(error);
    }
  };

  private addWeightLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { weight, user_id }: { weight: number; user_id: string } = req.body;
    try {
      if (!weight) {
        throw new Error('no weight');
      }
      if (!user_id) {
        throw new Error('no user id');
      }
      const results = await this.weightLogsController.createAiWeightLog(
        weight,
        user_id
      );
      console.log(weight, results);
      res.status(200).json({ res: 'Weight Added' });
    } catch (error) {
      next(error);
    }
  };

  private updatePreferences = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    // payload = {"preferences": tool_input["preferences"], "user_id": user_id}
    const {
      preferences,
      user_id,
    }: { preferences: AiProfile; user_id: string } = req.body;
    try {
      // something
      const userPreferences = { _id: user_id, ...preferences };

      const response = await this.userController.updateUser(userPreferences);
      console.log(response);
      res.status(200).json({ res: 'Profile updated' });
    } catch (error) {
      next(error);
    }
  };
}
