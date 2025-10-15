import express, { NextFunction, Request, Response, Router } from 'express';
import {
  ExerciseLogsController,
  FoodLogsController,
  UserController,
  WeightLogsController,
} from '../controllers';
import { AiFoodLogPayload, AiProfile, AiExerciseLogPayload } from '../types';

export class AiPrivateRoutes {
  private router: Router = express.Router();
  private foodLogsCtrl: FoodLogsController = new FoodLogsController();
  private weightLogsCtrl: WeightLogsController = new WeightLogsController();
  private exerciseLogsCtrl: ExerciseLogsController =
    new ExerciseLogsController();
  private userCtrl: UserController = new UserController();

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
    this.router.post('/add-exercise-log', this.addExerciseLog);
    this.router.post('/update-preferences', this.updatePreferences);
  }

  private test = (_req: Request, res: Response) =>
    res.send('private ai routes Ok');

  private addFoodLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const {
      meal_obj,
      user_id,
    }: { meal_obj: AiFoodLogPayload[]; user_id: string } = req.body;
    try {
      if (!meal_obj) {
        throw new Error('no food item');
      }
      if (!user_id) {
        throw new Error('no user id');
      }

      const results = await this.foodLogsCtrl.createAiFoodLog(
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
      const results = await this.weightLogsCtrl.createAiWeightLog(
        weight,
        user_id
      );
      console.log(weight, results);
      res.status(200).json({ res: 'Weight Added' });
    } catch (error) {
      next(error);
    }
  };

  private addExerciseLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const {
        exercise_obj,
        user_id,
      }: { exercise_obj: AiExerciseLogPayload; user_id: string } = req.body;
      console.log('me llega exercise obj', exercise_obj, user_id);
      const ret = await this.exerciseLogsCtrl.createAiExerciseLog(
        exercise_obj,
        user_id
      );
      res.status(200).json({ result: 'Exercise Added', ret });
    } catch (error) {
      next(error);
    }
  };

  private updatePreferences = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const {
      preferences,
      user_id,
    }: { preferences: AiProfile; user_id: string } = req.body;
    try {
      // something
      const userPreferences = { _id: user_id, ...preferences };

      await this.userCtrl.updateUser(userPreferences);
      res.status(200).json({ res: 'Profile updated' });
    } catch (error) {
      next(error);
    }
  };
}
