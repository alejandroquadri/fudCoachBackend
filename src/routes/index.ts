import { Application, Request, Response } from 'express';
import { CoachRoutes } from './coach.routes';
import { ChatRoutes } from './chat.routes';
import { UserRoutes } from './user.routes';
import { FoodLogsRoutes } from './food-logs.routes';
import { authJWT } from '../middlewares';

export const initializeRoutes = (app: Application) => {
  app.get('/', (req: Request, res: Response) => {
    res.send('Hello, cruel nice World!');
  });

  app.use('/coach', authJWT, new CoachRoutes().getRouter());
  app.use('/chat', authJWT, new ChatRoutes().getRouter());
  app.use('/food-logs', authJWT, new FoodLogsRoutes().getRouter());
  app.use('/users', new UserRoutes().getRouter());
};
