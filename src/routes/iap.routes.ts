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
  }

  public getRouter(): Router {
    return this.router;
  }

  test = async (res: Response) => {
    res.status(200).json({ mes: 'succes iap' });
  };

  validateIos = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { payload, userId } = req.body as {
        payload: ValidateIOSPayload;
        userId: string;
      };
      const out = await this.iapCtrl.validateIos(payload, userId);

      if (!out.ok) return res.status(400).json(out);
      return res.status(200).json(out);
    } catch (error) {
      console.log(error);
      next('Error validating ios');
    }
  };
}
