import bcrypt from 'bcryptjs';
import { User } from '../types';
import { mongoInstance } from '../connection';
import { ObjectId } from 'mongodb';

export class UserModel {
  createUser = async (
    email: string,
    name: string,
    password: string
  ): Promise<{ acknowledged: boolean; insertedId: ObjectId }> => {
    const hashedPassword = await bcrypt.hash(password, 8);
    return mongoInstance.db
      .collection('users')
      .insertOne({ email, name, password: hashedPassword });
  };

  getUserByEmail = (email: string): Promise<User | null> => {
    email = email.toLowerCase();
    return mongoInstance.db
      .collection('users')
      .findOne({ email }) as Promise<User | null>;
  };

  getUserById = (id: string | ObjectId): Promise<User | null> => {
    return mongoInstance.db
      .collection('users')
      .findOne({ _id: new ObjectId(id) }) as Promise<User | null>;
  };
}
