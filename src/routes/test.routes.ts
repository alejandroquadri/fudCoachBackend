import axios, { AxiosInstance } from 'axios';
import express, { NextFunction, Request, Response, Router } from 'express';
import { AiMicroserviceController } from '../controllers';

export class TestRoutes {
  private router: Router = express.Router();
  private microScCtrl: AiMicroserviceController =
    new AiMicroserviceController();
  private baseURL =
    process.env.NODE_ENV === 'production'
      ? 'http://fud-python:8000'
      : 'http://localhost:8000';
  private axiosInstance: AxiosInstance = axios.create({
    baseURL: this.baseURL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 10_000,
  });

  constructor() {
    this.initializeRoutes();
  }

  // private setBaseUrl(url: string) {
  //   this.axiosInstance.defaults.baseURL = url;
  // }

  private initializeRoutes(): void {
    this.router.get('/', this.test);
    this.router.post('/test-ai-com', this.testAiCom);
    this.router.post('/test-agent-answer', this.testAiAgent);
    this.router.post('/test-node-com', this.testNodeCom);
  }

  public getRouter(): Router {
    return this.router;
  }

  test = async (req: Request, res: Response) =>
    res.status(200).json({ res: 'Node working' });

  testAiCom = async (req: Request, res: Response, next: NextFunction) => {
    const { mes } = req.body;
    console.log('llega test ai com', mes);
    try {
      console.log('intento comunicarme');
      const response = await this.axiosInstance.post('/test-ai-com', {
        mes,
      });
      res.status(200).json(response.data);
    } catch (error) {
      console.log('error trying com with ai server');
      next(error);
    }
  };

  testAiAgent = async (req: Request, res: Response, next: NextFunction) => {
    const { mes, id } = req.body;
    console.log('get id and mes:', mes, id);
    try {
      const answer = await this.microScCtrl.getAiResponse(mes, id);
      res.status(200).json(answer);
    } catch (error) {
      console.log('error getting mes from agent test');
      next(error);
    }
  };

  testNodeCom = async (req: Request, res: Response, next: NextFunction) => {
    const { mes } = req.body;
    console.log('llega test node com', mes);
    try {
      console.log('intento comunicarme');
      res.status(200).json({ res: mes });
    } catch (error) {
      console.log('error trying com with ai server');
      next(error);
    }
  };
}
