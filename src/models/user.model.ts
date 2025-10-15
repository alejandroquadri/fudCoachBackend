import { ObjectId } from 'mongodb';
import { MongoService } from '../services'; // Import MongoService
import { AiProfile, UserProfile } from '../types';

export class UserModel {
  private mongoSc = new MongoService<UserProfile>('users');

  createUser(
    user: UserProfile
  ): Promise<{ acknowledged: boolean; insertedId: ObjectId }> {
    return this.mongoSc.create(user);
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

  getUserByAppleSub(appleSub: string): Promise<UserProfile | null> {
    return this.mongoSc.findOne({ appleSub });
  }

  async editUser(user: Partial<UserProfile> | (AiProfile & { _id: string })) {
    if (!user._id) {
      throw new Error('User ID is required for editing');
    }

    const { _id, ...updateData } = user;
    return this.mongoSc.update(_id, updateData);
  }
}
