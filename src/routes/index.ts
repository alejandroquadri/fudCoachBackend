import { Application, Request, Response } from 'express';
import { authJWT } from '../middlewares';
import { CoachRoutes } from './coach.routes';
import { ChatRoutes } from './chat.routes';
import { UserRoutes } from './user.routes';
import { FoodLogsRoutes } from './food-logs.routes';
import { WaterLogsRoutes } from './water-logs.routes';
import { ExerciseLogsRoutes } from './exercise-logs.routes';
import { WeightLogsRoutes } from './weight-logs.routes';
import { AiMicroserviceRoutes } from './ai-microservice.routes';
import { AiPrivateRoutes } from './ai-private.routes';
import { ProfileRoutes } from './profile.routes';
import { NotificationRoutes } from './notification.routes';
import { IapRoutes } from './iap.routes';

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
  app.use('/ai', authJWT, new AiMicroserviceRoutes().getRouter());
  app.use('/profile', authJWT, new ProfileRoutes().getRouter());
  app.use('/notifications', authJWT, new NotificationRoutes().getRouter());
  app.use('/ai-routes', new AiPrivateRoutes().getRouter());
  app.use('/iap', new IapRoutes().getRouter());
  app.use('/users', new UserRoutes().getRouter());
};
