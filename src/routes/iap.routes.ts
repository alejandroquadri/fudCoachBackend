import express, { NextFunction, Request, Response, Router } from 'express';
import { ValidateIOSPayload } from '../types';
import { IapController } from '../controllers';

export class IapRoutes {
  private router: Router = express.Router();
  private iapCtrl: IapController = new IapController();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get('/', this.test);
    this.router.post('/validate-ios', this.validateIos);
    this.router.post('/validate-subs-status', this.validateStatus);
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
      console.log('llega validateIOs', payload);
      const out = await this.iapCtrl.validateIos(payload);

      if (!out.ok) return res.status(400).json(out);
      return res.status(200).json(out);
    } catch (error) {
      console.log(error);
      next('Error validating ios');
    }
  };

  validateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { originalTransactionId } = req.body;
      const out = await this.iapCtrl.checkSubscriptionStatus(
        originalTransactionId
      );
      res.status(200).json({ ret: out });
    } catch (error) {
      console.log(error);
      next('Error validating status of subscription');
    }
  };
}
