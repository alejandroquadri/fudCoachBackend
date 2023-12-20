import bcrypt from 'bcryptjs';
import { User, newProfile } from '../types';
import { mongoInstance } from '../connection';
import { ObjectId } from 'mongodb';

export class UserModel {
  createUser = async (
    email: string,
    password: string,
    profile: newProfile
  ): Promise<{ acknowledged: boolean; insertedId: ObjectId }> => {
    const hashedPassword = await bcrypt.hash(password, 8);
    return mongoInstance.db.collection('users').insertOne({
      email,
      password: hashedPassword,
      name: profile.name,
      weightLogs: [
        {
          weightLog: Number(profile.weight),
          date: new Date(),
        },
      ],
      weightUnit: profile.weightUnit,
      height: profile.height,
      heightUnit: profile.heightUnit,
      birthday: profile.birthdate,
      gender: profile.gender,
      completedQA: false,
    });
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
