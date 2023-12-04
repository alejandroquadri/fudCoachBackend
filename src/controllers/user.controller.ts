import { UserModel } from '../models';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../types';
import { ObjectId } from 'mongodb';

export class UserController {
  userModel: UserModel;

  constructor() {
    this.userModel = new UserModel();
  }

  login = async (
    email: string,
    password: string
  ): Promise<string | { user: User; token: string; refreshToken: string }> => {
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
        const refreshToken = jwt.sign(
          { id: user._id },
          process.env.REFRESH_TOKEN_SECRET || 'refresh_secret',
          {
            expiresIn: '7d', // expires in 7 days
          }
        );
        return { user, token, refreshToken };
      }
    }
  };

  signUp = async (
    email: string,
    name: string,
    password: string
  ): Promise<string | User | null> => {
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

  getUserById = async (id: string | ObjectId) => {
    return this.userModel.getUserById(id);
  };

  refreshAccessToken = async (refreshToken: string) => {
    try {
      const decoded: any = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET || 'refresh_secret'
      );

      // Check if the refresh token is valid for the user (e.g., not revoked)
      // const validToken = await this.userModel.validateRefreshToken(
      //   decoded.id,
      //   refreshToken
      // );
      // if (!validToken) {
      //   return 'token_invalid';
      // }

      // Generate a new access token
      const accessToken = jwt.sign(
        { id: decoded.id },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: 86400 } // 24 hours
      );

      // Optionally generate a new refresh token
      const newRefreshToken = jwt.sign(
        { id: decoded.id },
        process.env.REFRESH_TOKEN_SECRET || 'refresh_secret',
        { expiresIn: '7d' } // 7 days
      );

      // Optionally store the new refresh token in the database
      // await this.userModel.storeRefreshToken(decoded.id, newRefreshToken);

      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      return 'token_invalid';
    }
  };
}
