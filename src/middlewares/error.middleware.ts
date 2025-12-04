import { NextFunction, Request, Response } from 'express';

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log('manejo un error', err);

  if (res.headersSent) {
    return next(err);
  }

  const message =
    typeof err === 'string' ? err : err?.message ?? 'Internal server error';

  res.status(500).json({ message });
};
