import express, { Router, Request, Response, NextFunction } from 'express';
import { FoodLogsController } from '../controllers';

export class FoodLogsRoutes {
  private router: Router = express.Router();
  private foodLogsController: FoodLogsController = new FoodLogsController();

  constructor() {
    this.initilizeRoutes();
  }

  private initilizeRoutes = () => {
    this.router.get('/', this.test);
    this.router.post('/by-date', this.getFoodLogs);
    this.router.post('/create', this.saveFoodLog);
    this.router.post('/edit', this.editFoodLog);
    this.router.post('/delete', this.deleteFoodLog);
  };

  public getRouter = () => {
    return this.router;
  };

  private test = (_req: Request, res: Response) =>
    res.send('food logs routes Ok');

  private getFoodLogs = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { user_id, date } = req.body;
    try {
      if (!user_id) {
        throw new Error('no user id');
      }
      if (!date) {
        throw new Error('no date');
      }
      const foodLogs = await this.foodLogsController.getFoodLogsByDate(
        user_id,
        date
      );
      res.status(200).json(foodLogs);
    } catch (error: unknown) {
      next(error);
    }
  };

  private saveFoodLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { foodLog } = req.body;

    try {
      if (!foodLog) {
        throw new Error('no food Log');
      }
      const foodLogRes = await this.foodLogsController.createFoodLog(foodLog);
      res.status(200).json(foodLogRes);
    } catch (error) {
      next(error);
    }
  };

  private editFoodLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { foodLog } = req.body;

    try {
      if (!foodLog) {
        throw new Error('no food Log');
      }
      const foodLogRes = await this.foodLogsController.editFoodLog(foodLog);
      res.status(200).json(foodLogRes);
    } catch (error) {
      next(error);
    }
  };

  private deleteFoodLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { id } = req.body;
    try {
      if (!id) {
        throw new Error('no id');
      }
      const foodLogRes = await this.foodLogsController.deleteLog(id);
      res.status(200).json(foodLogRes);
    } catch (error) {
      next(error);
    }
  };
}
