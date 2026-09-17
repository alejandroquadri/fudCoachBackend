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
