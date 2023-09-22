import Mongo from '../connection';
import bcrypt from 'bcryptjs';
import { User } from '../types';
import { ObjectId } from 'mongodb';

export class UserModel {
  createUser = async (
    email: string,
    name: string,
    password: string
  ): Promise<{ acknowledged: boolean; insertedId: ObjectId }> => {
    const hashedPassword = await bcrypt.hash(password, 8);
    return Mongo.db
      .collection('users')
      .insertOne({ email, name, password: hashedPassword });
  };

  getUserByEmail = (email: string): Promise<User> => {
    return Mongo.db.collection('users').findOne({ email });
  };

  getUserById = (id: string | ObjectId): Promise<User> => {
    return Mongo.db.collection('users').findOne({ _id: new ObjectId(id) });
  };
}
