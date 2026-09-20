import express, { NextFunction, Request, Response, Router } from 'express';

export class TestRoutes {
  private router: Router = express.Router();

  constructor() {
    this.initializeRoutes();
  }

  // private setBaseUrl(url: string) {
  //   this.axiosInstance.defaults.baseURL = url;
  // }

  private initializeRoutes(): void {
    this.router.get('/', this.test);
    this.router.post('/test-node-com', this.testNodeCom);
  }

  public getRouter(): Router {
    return this.router;
  }

  test = async (req: Request, res: Response) =>
    res.status(200).json({ res: 'Node working' });

  testNodeCom = async (req: Request, res: Response, next: NextFunction) => {
    const { mes } = req.body;
    console.log('llega test node com', mes);
    try {
      res.status(200).json({ res: mes });
    } catch (error) {
      console.log('error trying com with ai server');
      next(error);
    }
  };
}
