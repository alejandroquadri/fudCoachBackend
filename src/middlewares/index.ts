import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import passport from 'passport';

export * from './authJWT.middleware';

export const initializeMiddlewares = (app: express.Application) => {
  app.use(express.json());
  app.use(cors());
  app.use(passport.initialize());
  app.use(errorHandler);
  // ... any other middlewares ...
};

const errorHandler = (
  err: string,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log the error, for instance using console.error or a logging library
  console.log('manejo un error');
  const message = err ? err : 'Internal server error';

  // Send a generic error message to the client
  res.status(500).json({ message });
};
