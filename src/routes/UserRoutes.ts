import express, { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Mongo from '../connection';

export class UserRoutes {
  private router: Router = express.Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get('/', this.getUsers);
    this.router.get('/:id', this.getUserById);
    this.router.post('/signup', this.signup);
    this.router.post('/login', this.login);
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

  // nuevas rutas

  private async signup(req: Request, res: Response): Promise<void> {
    try {
      const { email, name, password } = req.body;
      console.log(email, password);
      // Hash the password
      const client = Mongo.client;
      const emailExists = await client
        .db(process.env.DB_NAME)
        .collection('users')
        .findOne({ email });

      console.log(emailExists);
      if (emailExists) {
        console.log('existe');
        res.status(201).send('email taken');
        return;
      }
      const hashedPassword = await bcrypt.hash(password, 8);

      const user = await client
        .db(process.env.DB_NAME)
        .collection('users')
        .insertOne({ email, name, password: hashedPassword });
      console.log(user);
      res.status(201).send(user);
      // client.close();
    } catch (error) {
      console.log('es error', error);
      res.status(400).send(error);
    }
  }

  private async login(req: Request, res: Response): Promise<any> {
    try {
      const { email, password } = req.body;
      const client = Mongo.client;
      const user = await client
        .db(process.env.DB_NAME)
        .collection('users')
        .findOne({ email });

      if (!user) {
        res.status(404).send({ error: 'User not found' });
        return;
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        res.status(400).send({ error: 'Invalid credentials' });
        return;
      }
      const token = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET || 'secret',
        {
          expiresIn: 86400, // expires in 24 hours
        }
      );

      res.status(200).send({ auth: true, user, token });
      // client.close();
    } catch (error) {
      res.status(500).send(error);
    }
  }
}
