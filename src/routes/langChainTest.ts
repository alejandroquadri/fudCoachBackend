import express, { Router, Request, Response } from 'express';

export class LangChTest {
  private router: Router = express.Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get('/', this.aiTest);
    this.router.get('/:id', this.getUserById);
  }

  private aiTest(req: Request, res: Response): void {
    res.send('Ai working well');
  }

  private getUserById(req: Request, res: Response): void {
    const userId = req.params.id;
    res.send(`User ID: ${userId}`);
  }

  public getRouter(): Router {
    return this.router;
  }
}
