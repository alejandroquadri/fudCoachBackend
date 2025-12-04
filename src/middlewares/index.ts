export * from './authJWT.middleware';
export * from './error.middleware';

// import express, { NextFunction, Request, Response } from 'express';
// import cors from 'cors';
// import passport from 'passport';

// export const initializeMiddlewares = (app: express.Application) => {
//   app.use(express.json());
//   app.use(cors());
//   app.use(passport.initialize());
//   app.use(errorHandler);
//   // ... any other middlewares ...
// };

// export const errorHandler = (
//   err: any,
//   _req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   console.log('manejo un error', err);
//
//   if (res.headersSent) {
//     return next(err);
//   }
//
//   const message =
//     typeof err === 'string' ? err : err?.message ?? 'Internal server error';
//
//   res.status(500).json({ message });
// };
//
// export const errorHandler = (
//   err: string,
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   // Log the error, for instance using console.error or a logging library
//   console.log('manejo un error');
//   const message = err ? err : 'Internal server error';
//
//   // Send a generic error message to the client
//   res.status(500).json({ message });
// };
