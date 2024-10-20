import express, { Router, Request, Response, NextFunction } from 'express';
import { WaterLogsController } from '../controllers';

export class WaterLogsRoutes {
  private router: Router = express.Router();
  private waterLogsCtrl: WaterLogsController = new WaterLogsController();

  constructor() {
    this.initilizeRoutes();
  }

  private initilizeRoutes = () => {
    this.router.get('/', this.test);
    this.router.post('/by-date', this.getWaterLogsByDate);
    this.router.post('/create', this.createWaterLog);
    this.router.post('/edit', this.editWaterLog);
    this.router.post('/delete', this.deleteWaterLog);
  };

  public getRouter = () => {
    return this.router;
  };

  private test = (_req: Request, res: Response) =>
    res.send('water logs routes Ok');

  private getWaterLogsByDate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { user_id, date } = req.body;
    try {
      if (!user_id) {
        throw new Error('no user id');
      }
      const waterLogs = await this.waterLogsCtrl.getWaterLogsByDate(
        user_id,
        date
      );
      res.status(200).json(waterLogs);
    } catch (error: unknown) {
      next(error);
    }
  };

  private createWaterLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { waterLog } = req.body;
    try {
      if (!waterLog) {
        throw new Error('no water log');
      }
      const waterLogRet = await this.waterLogsCtrl.createWaterLog(waterLog);
      res.status(200).json(waterLogRet);
    } catch (error: unknown) {
      next(error);
    }
  };

  editWaterLog = async (req: Request, res: Response, next: NextFunction) => {
    const { waterLog } = req.body;
    try {
      if (!waterLog) {
        throw new Error('no water log');
      }
      const waterLogRet = await this.waterLogsCtrl.editWaterLog(waterLog);
      res.status(200).json(waterLogRet);
    } catch (error: unknown) {
      next(error);
    }
  };

  deleteWaterLog = async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.body;
    try {
      if (!id) {
        throw new Error('no water log id');
      }
      const waterLogRet = await this.waterLogsCtrl.deleteWaterLog(id);
      res.status(200).json(waterLogRet);
    } catch (error: unknown) {
      next(error);
    }
  };
}
