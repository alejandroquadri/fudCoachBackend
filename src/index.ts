import express, { Application } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { mongoInstance } from './connection';
import { initializeMiddlewares } from './middlewares';
import { initializePassportStrategy } from './strategies/jwtStrategy';
import { initializeRoutes } from './routes';

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
      this.app.use(
        '/uploads',
        express.static(path.join(__dirname, '../uploads'))
      );
      this.initializeMiddlewares();
      this.initializePassport();
      this.initializeRoutes();

      this.app.listen(port, host, () => {
        console.log(`Server is running on port ${port}`);
      });
    } catch (error) {
      console.error('Failed to start the application:', error);
    }
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

const app = new App();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0'; // bind on all interfaces

// Start the app and ensure proper asynchronous flow
app.start(port, host).catch(err => {
  console.error('Error starting the application:', err);
});
