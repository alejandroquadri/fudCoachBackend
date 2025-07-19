import { UserModel } from '../models';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  NutritionGoals,
  OnboardingState,
  RegistrationData,
  User,
  UserProfile,
} from '../types';
import { ObjectId } from 'mongodb';
import { TargetsCalcService } from '../services';

export class UserController {
  userModel: UserModel;
  targetsSc: TargetsCalcService;

  constructor() {
    this.userModel = new UserModel();
    this.targetsSc = new TargetsCalcService();
  }

  async login(
    email: string,
    password: string
  ): Promise<
    string | { user: UserProfile; token: string; refreshToken: string }
  > {
    console.log('arranca', email);
    const user = await this.userModel
      .getUserByEmail(email)
      .catch((err: unknown) => console.log('error en mongo', err));
    console.log('obtengo usuario', user);
    if (!user) {
      return 'not_found';
    } else {
      console.log(password, user.password);
      const isMatch = await bcrypt.compare(password, user.password);
      console.log(isMatch);
      if (!isMatch) {
        return 'invalid_credentials';
      } else {
        console.log('llego hasta aca');
        const { token, refreshToken } = this.createTokens(user._id as string);
        return { user, token, refreshToken };
      }
    }
  }

  async hashtest(password: string) {
    const hashedPassword = await bcrypt.hash(password, 8);
    console.log(hashedPassword);
    const isMatch = await bcrypt.compare(password, hashedPassword);
    return isMatch;
  }

  async hashtest2(pass: string, hash: string) {
    const isMatch = await bcrypt.compare(pass, hash);
    return isMatch;
  }

  // async signUp(
  //   email: string,
  //   password: string,
  //   profile: RegistrationData
  // ): Promise<{ user: User; token: string; refreshToken: string }> {
  //   const emailExists = await this.userModel.getUserByEmail(email);
  //   if (emailExists) {
  //     throw new Error('email taken');
  //   }
  //   const hashedPassword = await bcrypt.hash(password, 8);
  //   const targObj = this.targetsSc.buildTargetObj(profile);
  //   console.log('esto vuelve de los calculos', targObj);
  //
  //   const insertedData = await this.userModel.createUser(
  //     email,
  //     hashedPassword,
  //     profile,
  //     targObj
  //   );
  //   const id = insertedData.insertedId;
  //   const { token, refreshToken } = this.createTokens(id.toHexString());
  //   const user = await this.getUserById(insertedData.insertedId.toHexString());
  //   if (user === null) {
  //     throw new Error('Error saving new user');
  //   }
  //   return { user, token, refreshToken };
  // }

  // TODO: aca tengo que hacer el nuevo register
  async register(
    userData: UserProfile
  ): Promise<{ user: UserProfile; token: string; refreshToken: string }> {
    const emailExists = await this.userModel.getUserByEmail(userData.email);
    if (emailExists) {
      throw new Error('email taken');
    }
    const hashedPassword = await bcrypt.hash(userData.password, 8);

    userData.password = hashedPassword;
    const insertedData = await this.userModel.createUser(userData);
    const id = insertedData.insertedId;
    const { token, refreshToken } = this.createTokens(id.toHexString());
    const user = await this.getUserById(insertedData.insertedId.toHexString());
    if (user === null) {
      throw new Error('Error saving new user');
    }
    return { user, token, refreshToken };
  }

  async getUserById(id: string | ObjectId) {
    return this.userModel.getUserById(id);
  }

  async refreshAccessToken(oldRefreshToken: string) {
    try {
      const decoded: any = jwt.verify(
        oldRefreshToken,
        process.env.REFRESH_TOKEN_SECRET || 'refresh_secret'
      );

      const { token, refreshToken } = this.createTokens(decoded.id);

      // Optionally store the new refresh token in the database
      // await this.userModel.storeRefreshToken(decoded.id, newRefreshToken);

      return { token, refreshToken };
    } catch (error) {
      return 'token_invalid';
    }
  }

  createTokens(id: string): { token: string; refreshToken: string } {
    // Generate a new access token
    const token = jwt.sign(
      { id },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: 86400 } // 24 hours (esta en segundos)
    );

    // Generate a new refresh token
    const refreshToken = jwt.sign(
      { id },
      process.env.REFRESH_TOKEN_SECRET || 'refresh_secret',
      { expiresIn: '7d' } // expires in 7 days
    );
    return { token, refreshToken };
  }

  async updateUser(user: User) {
    try {
      if (!user) {
        throw new Error('User is required for updating');
      }
      return this.userModel.editUser(user);
    } catch (error) {
      throw new Error('Error updating user');
    }
  }

  calculatePlan(userData: OnboardingState): NutritionGoals {
    const bmr = this.targetsSc.getBmr(
      userData.birthdate,
      userData.weight,
      userData.height,
      userData.gender
    );
    const tdee = this.targetsSc.getTdee(bmr, userData.lifeStyle);
    const dailyCaloricTarget = this.targetsSc.getDailyCaloricTarget(
      tdee,
      userData.goalVelocity
    );
    const macroTargets =
      this.targetsSc.getMacroNutrientsTargets(dailyCaloricTarget);
    return {
      tdee,
      bmr,
      dailyCaloricTarget,
      dailyCarbsTarget: macroTargets.carbs,
      dailyFatTarget: macroTargets.fat,
      dailyProteinTarget: macroTargets.protein,
    };
  }
}
