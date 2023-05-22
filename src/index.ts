import express, { Application, Request, Response } from 'express';
import cors from 'cors';

import Mongo from './connection';

import UserRoutes from './routes/UserRoutes';
import dotenv from 'dotenv';
dotenv.config();

class App {
  private app: Application;
  private userRoutes: UserRoutes;

  constructor() {
    this.app = express();
    this.userRoutes = new UserRoutes();
    this.initializeMiddlewares();
    this.connect();
    this.initializeRoutes();
  }

  private initializeMiddlewares(): void {
    this.app.use(express.json());
    this.app.use(cors());
  }

  private initializeRoutes(): void {
    this.app.get('/', (req: Request, res: Response) => {
      res.send('Hello, cruel World!');
    });
    this.app.use('/users', this.userRoutes.getRouter());
  }

  public start(port: number): void {
    this.app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  }

  async connect() {
    await Mongo.connect().catch((err: any) =>
      console.log('error en mongo', err)
    );
  }
}

const app = new App();
const port = Number(process.env.PORT || 5000); // esto lo dejo para ilustrar como obtener las env variables
app.start(port);
