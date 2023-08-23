import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { auth } from 'express-oauth2-jwt-bearer';

import Mongo from './connection';

import { UserRoutes, LangChTest } from './routes';
import dotenv from 'dotenv';
dotenv.config();

class App {
  private app: Application;
  private langChTestRoutes: LangChTest;
  private userRoutes: UserRoutes;

  private checkJwt = auth({
    issuerBaseURL: process.env.AUTHO_ISSUER_BASE_URL,
    audience: process.env.AUTHO_AUDIENCE,
  });

  constructor() {
    this.app = express();
    this.langChTestRoutes = new LangChTest();
    this.userRoutes = new UserRoutes();
    this.initializeMiddlewares();
    this.connect(); //para conectar a una BD mongo
    this.initializeRoutes();
  }

  private initializeMiddlewares(): void {
    this.app.use(express.json());
    this.app.use(cors());

    // Error handling for JWT validation
    this.app.use((err: any, req: any, res: any, next: any) => {
      if (err.name === 'UnauthorizedError') {
        res.status(401).send('Invalid token, or no token supplied!');
      } else {
        next(err);
      }
    });
  }
  // private initializeMiddlewares(): void {
  //   this.app.use(express.json());
  //   this.app.use(cors());
  // }

  private initializeRoutes(): void {
    this.app.get('/', (req: Request, res: Response) => {
      res.send('Hello, cruel nice World!');
    });
    this.app.use('/ai', this.checkJwt, this.langChTestRoutes.getRouter());
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
