import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
import { mongoInstance } from './connection';
import { initializeMiddlewares } from './middlewares';
import { initializePassportStrategy } from './strategies/jwtStrategy';
import { initializeRoutes } from './routes';
dotenv.config();

class App {
  private app: Application;

  constructor() {
    this.app = express();
    this.initializeMiddlewares();
    this.connect();
    this.initializePassport();
    this.initializeRoutes();
  }

  private initializeRoutes = () => {
    initializeRoutes(this.app);
  };

  private initializeMiddlewares(): void {
    initializeMiddlewares(this.app);
  }

  private initializePassport(): void {
    initializePassportStrategy();
  }

  public start(port: number): void {
    this.app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  }

  async connect() {
    await mongoInstance
      .connect()
      .catch((err: any) => console.log('error en mongo', err));
  }
}

const app = new App();
const port = Number(process.env.PORT || 5000);
app.start(port);
