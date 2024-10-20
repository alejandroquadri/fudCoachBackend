import express, { Router, Request, Response, NextFunction } from 'express';
import { ExerciseLogsController } from '../controllers';

export class ExerciseLogsRoutes {
  private router: Router = express.Router();
  private exerciseLogsCtrl: ExerciseLogsController =
    new ExerciseLogsController();

  constructor() {
    this.initilizeRoutes();
  }

  private initilizeRoutes = () => {
    this.router.get('/', this.test);
    this.router.post('/by-date', this.getExerciseLogsByDate);
    this.router.post('/create', this.createExerciseLog);
    this.router.post('/edit', this.editExerciseLog);
    this.router.post('/delete', this.deleteExerciseLog);
  };

  public getRouter = () => {
    console.log('get router from exercise routes');
    return this.router;
  };

  private test = (_req: Request, res: Response) =>
    res.send('exercise logs routes Ok');

  private getExerciseLogsByDate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { user_id, date } = req.body;
    try {
      if (!user_id) {
        throw new Error('no user id');
      }
      const exerciseLogs = await this.exerciseLogsCtrl.getExerciseLogsByDate(
        user_id,
        date
      );
      res.status(200).json(exerciseLogs);
    } catch (error: unknown) {
      next(error);
    }
  };

  private createExerciseLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { exerciseLog } = req.body;
    try {
      if (!exerciseLog) {
        throw new Error('no exercise log');
      }
      const exerciseLogCreated = await this.exerciseLogsCtrl.createExerciseLog(
        exerciseLog
      );
      res.status(200).json(exerciseLogCreated);
    } catch (error: unknown) {
      next(error);
    }
  };

  private editExerciseLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { exerciseLog } = req.body;
    try {
      if (!exerciseLog) {
        throw new Error('no exercise log');
      }
      const exerciseLogEdited = await this.exerciseLogsCtrl.editExerciseLog(
        exerciseLog
      );
      res.status(200).json(exerciseLogEdited);
    } catch (error: unknown) {
      next(error);
    }
  };

  private deleteExerciseLog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { id } = req.body;
    try {
      if (!id) {
        throw new Error('no id');
      }
      const exerciseLogDeleted = await this.exerciseLogsCtrl.deleteExerciseLog(
        id
      );
      res.status(200).json(exerciseLogDeleted);
    } catch (error: unknown) {
      next(error);
    }
  };
}
