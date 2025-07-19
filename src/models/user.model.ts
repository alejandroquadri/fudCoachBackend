import { ObjectId } from 'mongodb';
import { MongoService } from '../services'; // Import MongoService
import { User, UserProfile } from '../types';

export class UserModel {
  private mongoSc = new MongoService<UserProfile>('users');

  // TODO: aca tengo que crear un nuevo register User similar al de arriba
  createUser(
    user: UserProfile
  ): Promise<{ acknowledged: boolean; insertedId: ObjectId }> {
    const form = {
      ...user,
      weightLogs: [
        {
          weightLog: Number(user.initWeight),
          date: new Date(),
        },
      ],
    };
    return this.mongoSc.create(form);
  }

  /**
   * Find a user by email
   * @param email - The user's email
   * @returns The user document or null
   */
  async getUserByEmail(email: string): Promise<UserProfile | null> {
    email = email.toLowerCase();
    const query = { email };

    // Use MongoService to find the user by email
    return this.mongoSc.findOne(query);
  }

  /**
   * Find a user by ID
   * @param id - The user's ID (either string or ObjectId)
   * @returns The user document or null
   */
  async getUserById(id: string | ObjectId): Promise<UserProfile | null> {
    id = typeof id === 'string' ? new ObjectId(id) : id;
    const query = { _id: id };
    return this.mongoSc.findOne(query);
  }

  async editUser(user: User) {
    if (!user._id) {
      throw new Error('User ID is required for editing');
    }

    const { _id, ...updateData } = user;
    return this.mongoSc.update(_id, updateData);
  }
}

// /**
//  * Create a new user in the database
//  * @param email - User's email
//  * @param password - User's password (hashed)
//  * @param profile - Registration data
//  * @param targetObj - Target object for user goals
//  * @returns Insert result with acknowledged and insertedId
//  */
// async createUser(
//   email: string,
//   password: string,
//   profile: RegistrationData,
//   targetObj: TargetObj
// ): Promise<{ acknowledged: boolean; insertedId: ObjectId }> {
//   // Prepare the user data without _id
//   const form: UserWithoutId = {
//     email,
//     password,
//     name: profile.name,
//     weightLogs: [
//       {
//         weightLog: Number(profile.weight),
//         date: new Date(),
//       },
//     ],
//     weightUnit: profile.weightUnit,
//     height: profile.height,
//     heightUnit: profile.heightUnit,
//     birthday: profile.birthdate,
//     sex: profile.sex,
//     completedQA: true,
//     ...targetObj,
//   };
//
//   // Use MongoService to insert the user and return the result
//   return this.mongoSc.create(form);
// }
