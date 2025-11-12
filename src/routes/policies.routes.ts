import express, { Router, Request, Response } from 'express';
import path from 'path';

export class PoliciesRoutes {
  private router: Router = express.Router();

  constructor() {
    this.initializeRoutes();
  }

  public getRouter(): Router {
    return this.router;
  }

  private initializeRoutes(): void {
    this.router.get('/', this.test);
    this.router.get('/privacy', this.privacy);
    this.router.get('/support', this.support);
  }

  private test = (_req: Request, res: Response) =>
    res.send('privacy routes Ok');

  private privacy = (_req: Request, res: Response) => {
    const p = path.join(process.cwd(), 'public', 'privacy.html');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(p);
  };

  private support = (_req: Request, res: Response) => {
    const p = path.join(process.cwd(), 'public', 'support.html');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(p);
  };
}
