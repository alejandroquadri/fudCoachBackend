import { UserModel } from '../models';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../types';

export class UserController {
  userModel: UserModel;

  constructor() {
    this.userModel = new UserModel();
    console.log('construyo user controller');
  }

  login = async (
    email: string,
    password: string
  ): Promise<string | { user: User; token: string }> => {
    console.log('arranca', email);
    const user = await this.userModel.getUserByEmail(email);
    console.log('obtengo usuario', user);
    if (!user) {
      return 'not_found';
    } else {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return 'invalid_credentials';
      } else {
        console.log('llego hasta aca');
        const token = jwt.sign(
          { id: user._id },
          process.env.JWT_SECRET || 'secret',
          {
            expiresIn: 86400, // expires in 24 hours
          }
        );
        return { user, token };
      }
    }
  };

  signUp = async (
    email: string,
    name: string,
    password: string
  ): Promise<string | User> => {
    const emailExists = await this.userModel.getUserByEmail(email);
    if (emailExists) {
      return 'email taken';
    }
    const hashedPassword = await bcrypt.hash(password, 8);
    const insertedData = await this.userModel.createUser(
      email,
      name,
      hashedPassword
    );
    return this.userModel.getUserById(insertedData.insertedId);
  };
}
