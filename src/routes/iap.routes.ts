import express, { NextFunction, Request, Response, Router } from 'express';
import { UserProfile, ValidateIOSPayload } from '../types';
import { IapController } from '../controllers';

export class IapRoutes {
  private router: Router = express.Router();
  private iapCtrl: IapController = new IapController();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get('/', this.test);
    this.router.get('/entitlement', this.getEntitlement);
    this.router.post('/validate-ios', this.validateIos);
  }

  public getRouter(): Router {
    return this.router;
  }

  appStoreNotification = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const signedPayload = req.body?.signedPayload;
    if (typeof signedPayload !== 'string' || !signedPayload) {
      return res.status(400).json({ message: 'Missing signedPayload' });
    }

    try {
      await this.iapCtrl.processAppStoreNotification(signedPayload);
      return res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  };

  test = async (_req: Request, res: Response) => {
    res.status(200).json({ mes: 'succes iap' });
  };

  validateIos = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { payload } = req.body as {
        payload: ValidateIOSPayload;
      };
      const out = await this.iapCtrl.validateIos(
        payload,
        req.user as UserProfile
      );

      if (!out.ok) return res.status(422).json(out);
      return res.status(200).json(out);
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  getEntitlement = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = await this.iapCtrl.getCurrentEntitlement(
        req.user as UserProfile
      );
      res.status(200).json(out);
    } catch (error) {
      next(error);
    }
  };
}
