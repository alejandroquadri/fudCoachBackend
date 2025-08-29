import express, { Router, Request, Response, NextFunction } from 'express';
import { NotificationController } from '../controllers';
import { SaveNotificationTokenPayload } from '../types/notification.types';

export class NotificationRoutes {
  private router: Router = express.Router();
  private notificationController: NotificationController =
    new NotificationController();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes = () => {
    this.router.get('/', this.test);
    this.router.post('/save-token', this.saveNotificationToken);
    this.router.post('/send', this.sendNotification);
    // Add more routes as needed
  };

  public getRouter = () => {
    return this.router;
  };

  private test = (_req: Request, res: Response) =>
    res.send('notification routes Ok');

  private saveNotificationToken = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { notificationPayload } = req.body;
      const result = await this.notificationController.savePushToken(
        notificationPayload as SaveNotificationTokenPayload
      );
      res
        .status(200)
        .json({ message: 'Notification token saved successfully', result });
    } catch (error) {
      next(error);
    }
  };

  private sendNotification = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { userId, title, body, data, env } = req.body || {};
      if (!userId || !body) {
        return res
          .status(400)
          .json({ message: 'userId and body are required' });
      }
      const out = await this.notificationController.sendNotificationToUser(
        userId,
        { title, body, data },
        env
      );
      res.status(200).json(out);
    } catch (error) {
      next(error);
    }
  };
}
