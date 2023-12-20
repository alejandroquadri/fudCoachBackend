import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { User } from '../types';

// Custom middleware for JWT authentication
export const authJWT = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate(
    'jwt',
    { session: false },
    (err: Error | null, user: User | false, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user || info?.name === 'TokenExpiredError') {
        return res
          .status(401)
          .json({ message: 'Unauthorized or Token Expired' });
      }
      req.user = user;
      next();
    }
  )(req, res, next);
};
