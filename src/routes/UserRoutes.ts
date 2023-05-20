import express, { Router, Request, Response } from 'express';

class UserRoutes {
  private router: Router = express.Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get('/', this.getUsers);
    this.router.get('/:id', this.getUserById);
  }

  private getUsers(req: Request, res: Response): void {
    res.send('Users Home');
  }

  private getUserById(req: Request, res: Response): void {
    const userId = req.params.id;
    res.send(`User ID: ${userId}`);
  }

  public getRouter(): Router {
    return this.router;
  }
}

export default UserRoutes;
