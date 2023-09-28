import { Application, Request, Response } from 'express';
import passport from 'passport';
import { CoachRoutes } from './coach.routes';
import { ChatRoutes } from './chat.routes';
import { UserRoutes } from './user.routes';
import { LangChTest } from './langChainTest';

export const initializeRoutes = (app: Application) => {
  app.get('/', (req: Request, res: Response) => {
    res.send('Hello, cruel nice World!');
  });

  app.use(
    '/ai',
    passport.authenticate('jwt', { session: false }),
    new LangChTest().getRouter()
  );
  app.use(
    '/coach',
    passport.authenticate('jwt', { session: false }),
    new CoachRoutes().getRouter()
  );
  app.use(
    '/chat',
    passport.authenticate('jwt', { session: false }),
    new ChatRoutes().getRouter()
  );
  app.use('/users', new UserRoutes().getRouter());
};
