import express, { Application } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { mongoInstance } from './connection';
import { errorHandler } from './middlewares';
import { initializePassportStrategy } from './strategies/jwtStrategy';
import { initializeRoutes } from './routes';
import { stopAgenda, registerNotificationJobs } from './jobs';
import cors from 'cors';
import passport from 'passport';

dotenv.config();

class App {
  private app: Application;

  constructor() {
    this.app = express();
  }

  // Separate the initialization logic from the constructor to control the flow
  public async start(port: number, host = '0.0.0.0'): Promise<void> {
    try {
      await this.connect(); // Ensure MongoDB is connected before anything else

      //  define Agenda jobs then start worker
      registerNotificationJobs(); // definitions first

      this.app.use(
        '/uploads',
        express.static(path.join(__dirname, '../uploads'))
      );

      // set middlewares
      this.app.use(express.json());
      this.app.use(cors());
      this.app.use(passport.initialize());
      initializePassportStrategy();

      // init routes and error handler
      initializeRoutes(this.app);
      this.app.use(errorHandler);

      this.app.listen(port, host, () => {
        console.log(`Server is running on port ${port}`);
      });

      //  graceful shutdown (keep your existing handler if you already have one)
      ['SIGINT', 'SIGTERM'].forEach(sig => {
        process.on(sig as NodeJS.Signals, async () => {
          try {
            await stopAgenda();
          } finally {
            process.exit(0);
          }
        });
      });
    } catch (error) {
      console.error('Failed to start the application:', error);
    }
  }

  // Ensure the connection is properly awaited
  private async connect(): Promise<void> {
    try {
      await mongoInstance.connect();
      console.log('Connected to MongoDB');
    } catch (err) {
      console.log('Error connecting to MongoDB:', err);
      throw err; // Rethrow the error to prevent the app from starting
    }
  }
}

console.log('env', process.env.NODE_ENV);
const app = new App();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0'; // bind on all interfaces

// Start the app and ensure proper asynchronous flow
app.start(port, host).catch(err => {
  console.error('Error starting the application:', err);
});
