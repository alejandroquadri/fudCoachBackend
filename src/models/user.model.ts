import { ObjectId } from 'mongodb';
import { RegistrationData, TargetObj, User, UserWithoutId } from '../types';
import { MongoService } from '../services'; // Import MongoService

export class UserModel {
  private mongoService: MongoService<User>;

  constructor() {
    // Instantiate the MongoService for the 'users' collection
    this.mongoService = new MongoService<User>('users');
  }

  /**
   * Create a new user in the database
   * @param email - User's email
   * @param password - User's password (hashed)
   * @param profile - Registration data
   * @param targetObj - Target object for user goals
   * @returns Insert result with acknowledged and insertedId
   */
  async createUser(
    email: string,
    password: string,
    profile: RegistrationData,
    targetObj: TargetObj
  ): Promise<{ acknowledged: boolean; insertedId: ObjectId }> {
    // Prepare the user data without _id
    const form: UserWithoutId = {
      email,
      password,
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
      sex: profile.sex,
      completedQA: true,
      ...targetObj,
    };

    // Use MongoService to insert the user and return the result
    return this.mongoService.create(form);
  }

  /**
   * Find a user by email
   * @param email - The user's email
   * @returns The user document or null
   */
  async getUserByEmail(email: string): Promise<User | null> {
    email = email.toLowerCase();
    const query = { email };

    // Use MongoService to find the user by email
    return this.mongoService.findOne(query);
  }

  /**
   * Find a user by ID
   * @param id - The user's ID (either string or ObjectId)
   * @returns The user document or null
   */
  async getUserById(id: string | ObjectId): Promise<User | null> {
    id = typeof id === 'string' ? new ObjectId(id) : id;
    const query = { _id: id };
    return this.mongoService.findOne(query);
  }
}
