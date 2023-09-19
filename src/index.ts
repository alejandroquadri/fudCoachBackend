import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as JWTStrategy, ExtractJwt } from 'passport-jwt';

import { ObjectId } from 'mongodb';
import Mongo from './connection';

import { UserRoutes, LangChTest } from './routes';
import dotenv from 'dotenv';
dotenv.config();

class App {
  private app: Application;
  private langChTestRoutes: LangChTest;
  private userRoutes: UserRoutes;
  private db: any;

  constructor() {
    this.app = express();
    this.langChTestRoutes = new LangChTest();
    this.userRoutes = new UserRoutes();
    this.initializeMiddlewares();
    this.connect();
    this.initializePassport();
    this.initializeRoutes();
  }

  private initializeMiddlewares(): void {
    this.app.use(express.json());
    this.app.use(cors());
    this.app.use(passport.initialize());
  }

  private initializePassport(): void {
    passport.use(
      new JWTStrategy(
        {
          jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
          secretOrKey: process.env.JWT_SECRET,
        },
        async (jwtPayload, done) => {
          try {
            const _id = new ObjectId(jwtPayload.id);
            const user = await Mongo.client
              .db(process.env.DB_NAME)
              .collection('users')
              .findOne({ _id });
            // console.log(jwtPayload.id, user);
            if (user) {
              return done(null, user);
            } else {
              return done(null, false);
            }
          } catch (err) {
            return done(err, false);
          }
        }
      )
    );
  }

  private initializeRoutes(): void {
    this.app.get('/', (req: Request, res: Response) => {
      res.send('Hello, cruel nice World!');
    });

    this.app.use(
      '/ai',
      passport.authenticate('jwt', { session: false }),
      this.langChTestRoutes.getRouter()
    );
    this.app.use('/users', this.userRoutes.getRouter());
  }

  public start(port: number): void {
    this.app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  }

  async connect() {
    this.db = await Mongo.connect().catch((err: any) =>
      console.log('error en mongo', err)
    );
  }
}

const app = new App();
const port = Number(process.env.PORT || 5000);
app.start(port);

// import express, { Application, Request, Response } from 'express';
// import cors from 'cors';

// import Mongo from './connection';

// import { UserRoutes, LangChTest } from './routes';
// import dotenv from 'dotenv';
// dotenv.config();

// class App {
//   private app: Application;
//   private langChTestRoutes: LangChTest;
//   private userRoutes: UserRoutes;

//   constructor() {
//     this.app = express();
//     this.langChTestRoutes = new LangChTest();
//     this.userRoutes = new UserRoutes();
//     this.initializeMiddlewares();
//     this.connect(); //para conectar a una BD mongo
//     this.initializeRoutes();
//   }

//   private initializeMiddlewares(): void {
//     this.app.use(express.json());
//     this.app.use(cors());
//   }

//   private initializeRoutes(): void {
//     this.app.get('/', (req: Request, res: Response) => {
//       res.send('Hello, cruel nice World!');
//     });
//     this.app.use('/ai', this.langChTestRoutes.getRouter());
//     this.app.use('/users', this.userRoutes.getRouter());
//   }

//   public start(port: number): void {
//     this.app.listen(port, () => {
//       console.log(`Server is running on port ${port}`);
//     });
//   }

//   async connect() {
//     await Mongo.connect().catch((err: any) =>
//       console.log('error en mongo', err)
//     );
//   }
// }

// const app = new App();
// const port = Number(process.env.PORT || 5000); // esto lo dejo para ilustrar como obtener las env variables
// app.start(port);
