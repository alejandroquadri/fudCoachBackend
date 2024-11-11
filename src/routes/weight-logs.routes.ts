import express, { Router, Request, Response, NextFunction } from 'express';
import { WeightLogsController } from '../controllers';

export class WeightLogsRoutes {
  private router: Router = express.Router();
  private weightLogsCtrl: WeightLogsController = new WeightLogsController();

  constructor() {
    this.initilizeRoutes();
  }
  private initilizeRoutes = () => {
    this.router.get('/', this.test);
    this.router.post('/get', this.getWeightLogs);
    this.router.post('/create', this.createWeightLog);
    this.router.post('/edit', this.editWeightLog);
    this.router.post('/delete', this.deleteWeightLog);
  };

  public getRouter = () => {
    return this.router;
  };

  private test = (_req: Request, res: Response) =>
    res.send('weight logs routes Ok');

  private getWeightLogs = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { user_id } = req.body;
    try {
      if (!user_id) {
        throw new Error('no user id');
      }
      const weightLogs = await this.weightLogsCtrl.getWeightLog(user_id);
      res.status(200).json(weightLogs);
    } catch (error: unknown) {
      next(error);
    }
  };

  private createWeightLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { weightLog } = req.body;
      if (!weightLog) {
        throw new Error('no weight log');
      }
      const weightLogRes = await this.weightLogsCtrl.createWeightLog(weightLog);
      res.status(200).json(weightLogRes);
    } catch (error: unknown) {
      next(error);
    }
  };

  private editWeightLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { weightLog } = req.body;
      if (!weightLog) {
        throw new Error('no weight log');
      }

      const weightLogRes = await this.weightLogsCtrl.editWeightLog(weightLog);
      res.status(200).json(weightLogRes);
    } catch (error: unknown) {
      next(error);
    }
  };

  private deleteWeightLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { id } = req.body;
      if (!id) {
        throw new Error('no weight id');
      }
      const weightLogRes = await this.weightLogsCtrl.deleteWeightLog(id);
      res.status(200).json(weightLogRes);
    } catch (error: unknown) {
      next(error);
    }
  };
}
