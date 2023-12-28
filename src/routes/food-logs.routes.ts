import express, { Router, Request, Response, NextFunction } from 'express';
import { FoodLogsController } from '../controllers';

export class FoodLogsRoutes {
  private router: Router = express.Router();
  private foodLogsController: FoodLogsController;

  constructor() {
    this.initilizeRoutes();
    this.foodLogsController = new FoodLogsController();
  }

  private initilizeRoutes = () => {
    this.router.get('/', this.test);
    this.router.post('/by-date', this.getFoodLogs);
  };

  public getRouter = () => {
    return this.router;
  };

  private test = (req: Request, res: Response) =>
    res.send('food logs routes Ok');

  private getFoodLogs = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { userId, date } = req.body;
    try {
      if (!userId) {
        throw new Error('no user id');
      }
      if (!date) {
        throw new Error('no user id');
      }
      const foodLogs = await this.foodLogsController.getFoodLogsByDate(
        userId,
        date
      );
      res.status(200).json(foodLogs);
    } catch (error: unknown) {
      next(error);
    }
  };
}
