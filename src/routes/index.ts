import { Application, Request, Response } from 'express';
import { authJWT } from '../middlewares';
import { CoachRoutes } from './coach.routes';
import { ChatRoutes } from './chat.routes';
import { UserRoutes } from './user.routes';
import { FoodLogsRoutes } from './food-logs.routes';
import { WaterLogsRoutes } from './water-logs.routes';
import { ExerciseLogsRoutes } from './exercise-logs.routes';
import { WeightLogsRoutes } from './weight-logs.routes';

export const initializeRoutes = (app: Application) => {
  app.get('/', (_req: Request, res: Response) => {
    res.send('Hello, cruel nice World!');
  });

  app.use('/coach', authJWT, new CoachRoutes().getRouter());
  app.use('/chat', authJWT, new ChatRoutes().getRouter());
  app.use('/food-logs', authJWT, new FoodLogsRoutes().getRouter());
  app.use('/water-logs', authJWT, new WaterLogsRoutes().getRouter());
  app.use('/exercise-logs', authJWT, new ExerciseLogsRoutes().getRouter());
  app.use('/weight-logs', authJWT, new WeightLogsRoutes().getRouter());
  app.use('/users', new UserRoutes().getRouter());
};
