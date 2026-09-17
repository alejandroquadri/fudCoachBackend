import { format } from 'date-fns';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'crypto';

import { UserModel } from '../models';
import { JoseService, TargetsCalcService } from '../services';
import {
  AiProfile,
  NutritionGoals,
  OnboardingState,
  ProfileUpdateInput,
  PublicUserProfile,
  RegistrationUserInput,
  UserProfile,
} from '../types';
import { WeightLogsController } from './weight-log.controller';

const PROFILE_FIELDS: Array<keyof ProfileUpdateInput> = [
  'name',
  'avatar',
  'gender',
  'lifeStyle',
  'activityLevel',
  'triedOtherApps',
  'unitType',
  'initWeight',
  'height',
  'birthdate',
  'goal',
  'weightGoal',
  'goalVelocity',
  'goalObstacle',
  'dietType',
  'outcome',
  'nutritionGoals',
  'dietaryRestrictions',
  'allergies',
  'dislikes',
  'likes',
  'meal_times',
  'deliveredWelcome',
];

const pickProfileFields = (input: Partial<UserProfile>): ProfileUpdateInput => {
  const output: ProfileUpdateInput = {};
  for (const field of PROFILE_FIELDS) {
    const value = input[field];
    if (value !== undefined) {
      Object.assign(output, { [field]: value });
    }
  }
  return output;
};

const toPublicUser = (user: UserProfile): PublicUserProfile => {
  const safeUser = { ...user };
  delete safeUser.password;
  return safeUser;
};

export const toAiProfile = (user: UserProfile): AiProfile =>
  pickProfileFields(user) as AiProfile;

export class UserController {
  userModel: UserModel = new UserModel();
  weightLogsCtrl: WeightLogsController = new WeightLogsController();
  targetsSc: TargetsCalcService = new TargetsCalcService();
  ios_bundle_id = process.env.APP_BUNDLE_ID!;

  async login(
    email: string,
    password: string
  ): Promise<
    string | { user: PublicUserProfile; token: string; refreshToken: string }
  > {
    let user = await this.userModel
      .getUserByEmail(email)
      .catch((err: unknown) => console.log('error en mongo', err));
    if (!user) {
      return 'not_found';
    } else {
      if (!user.password) {
        throw new Error('no password');
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return 'invalid_credentials';
      } else {
        user = await this.ensureAppAccountToken(user);
        const { token, refreshToken } = this.createTokens(user._id as string);
        return { user: toPublicUser(user), token, refreshToken };
      }
    }
  }

  /**
   * - Verifies Apple ID token via JoseService
   * - If user exists by appleSub -> return tokens
   * - Else if user exists by Apple's email -> link appleSub -> return tokens
   * - Else if no user and userData provided -> create full profile using userData (hash password if present)
   * - Else create minimal Apple-only user
   */
  async loginApple(
    idToken: string,
    register: boolean,
    userData?: Partial<RegistrationUserInput>
  ): Promise<{ user: PublicUserProfile; token: string; refreshToken: string }> {
    const { payload } = await JoseService.verifyAppleIdToken(
      idToken,
      this.ios_bundle_id
    );

    const appleSub = String(payload.sub);
    const emailFromApple =
      typeof payload.email === 'string'
        ? payload.email.toLowerCase()
        : undefined;
    const isRelay =
      !!emailFromApple && emailFromApple.endsWith('@privaterelay.appleid.com');

    // 1) Prefer lookup by appleSub
    let user = await this.userModel.getUserByAppleSub(appleSub);

    // 2) Otherwise try by **Apple-reported** email only (do not trust userData.email for linking)
    if (!user && emailFromApple) {
      user = await this.userModel.getUserByEmail(emailFromApple);
      if (user) {
        const providers = Array.from(
          new Set([...(user.providers ?? []), 'apple'])
        ) as Array<'email' | 'apple'>;
        await this.userModel.editUser({
          _id: user._id,
          appleSub,
          providers,
          ...(isRelay ? { appleEmailPrivateRelay: true } : {}),
        });
        user.appleSub = appleSub;
        user.providers = providers;
        if (isRelay) user.appleEmailPrivateRelay = true;
      }
    }

    // 3) Create new user
    if (!user) {
      // Decide the email we will store
      const chosenEmail =
        emailFromApple ??
        (userData?.email ? userData.email.toLowerCase() : undefined) ??
        `${appleSub}@privaterelay.appleid.com`;

      // Start with Apple-required fields
      const doc: Partial<UserProfile> = {
        email: chosenEmail,
        name: userData?.name ?? 'New User',
        providers: ['apple'],
        appleSub,
        appleEmailPrivateRelay: !!emailFromApple && isRelay,
        appAccountToken: randomUUID(),
        deliveredWelcome: false,
      };

      // If onboarding provided more profile info, merge it in
      if (userData) {
        // Never override appleSub/providers set above, but merge the rest
        // Prefer the Apple email over user-provided if Apple gave one
        Object.assign(doc, pickProfileFields(userData));

        // // If onboarding also set a password, hash it so email+password login will work too
        // if (password && password.length > 0) {
        //   doc.password = await bcrypt.hash(password, 8);
        //   // Include 'email' as a provider if we stored a password
        //   doc.providers = Array.from(
        //     new Set([...(doc.providers ?? []), 'email'])
        //   ) as Array<'email' | 'apple'>;
        // }
      }

      const inserted = await this.userModel.createUser(doc as UserProfile);
      user = await this.getUserById(inserted.insertedId.toHexString());
      if (!user) throw new Error('Error creating Apple user');
    }

    user = await this.ensureAppAccountToken(user);

    if (user._id && register === true) {
      await this.weightLogsCtrl.createWeightLog({
        user_id: user._id,
        date: format(new Date(), 'yyyy-MM-dd'),
        weightLog: user.initWeight,
      });
    }

    const { token, refreshToken } = this.createTokens(String(user._id));
    return { user: toPublicUser(user), token, refreshToken };
  }

  async hashtest(password: string) {
    const hashedPassword = await bcrypt.hash(password, 8);
    const isMatch = await bcrypt.compare(password, hashedPassword);
    return isMatch;
  }

  async register(
    userData: RegistrationUserInput
  ): Promise<{ user: PublicUserProfile; token: string; refreshToken: string }> {
    const emailExists = await this.userModel.getUserByEmail(userData.email);
    if (emailExists) {
      throw new Error('email taken');
    }
    if (!userData.password) {
      throw new Error('no password');
    }
    const hashedPassword = await bcrypt.hash(userData.password, 8);

    const userDocument = {
      ...pickProfileFields(userData),
      email: userData.email.toLowerCase(),
      password: hashedPassword,
      providers: ['email'] as Array<'email' | 'apple'>,
      appAccountToken: randomUUID(),
      deliveredWelcome: false,
    } as UserProfile;

    const insertedData = await this.userModel.createUser(userDocument);
    const id = insertedData.insertedId;
    const { token, refreshToken } = this.createTokens(id.toHexString());
    const user = await this.getUserById(insertedData.insertedId.toHexString());
    if (user === null) {
      throw new Error('Error saving new user');
    }
    if (user._id) {
      await this.weightLogsCtrl.createWeightLog({
        user_id: user._id,
        date: format(new Date(), 'yyyy-MM-dd'),
        weightLog: user.initWeight,
      });
    }
    return { user: toPublicUser(user), token, refreshToken };
  }

  async getUserById(id: string | ObjectId) {
    return this.userModel.getUserById(id);
  }

  async getPublicUserById(id: string | ObjectId) {
    const user = await this.getUserById(id);
    if (!user) return null;
    const withAccountToken = await this.ensureAppAccountToken(user);
    return toPublicUser(withAccountToken);
  }

  async updateProfileForUser(
    id: string | ObjectId,
    input: Partial<UserProfile>
  ) {
    return this.userModel.editUser({
      _id: id,
      ...pickProfileFields(input),
    });
  }

  async ensureAppAccountToken(user: UserProfile): Promise<UserProfile> {
    if (user.appAccountToken) return user;

    const appAccountToken = randomUUID();
    await this.userModel.editUser({ _id: user._id, appAccountToken });
    return { ...user, appAccountToken };
  }

  async updateEntitlementForUser(
    id: string | ObjectId,
    entitlement: UserProfile['entitlement']
  ) {
    return this.userModel.editUser({ _id: id, entitlement });
  }

  async refreshAccessToken(oldRefreshToken: string) {
    try {
      const decoded = jwt.verify(
        oldRefreshToken,
        process.env.REFRESH_TOKEN_SECRET || 'refresh_secret'
      ) as JwtPayload;

      const { token, refreshToken } = this.createTokens(decoded.id);

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

  calculatePlan(userData: OnboardingState): NutritionGoals {
    const bmr = this.targetsSc.getBmr(
      userData.birthdate,
      userData.initWeight,
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

  deleteUser(id: string) {
    //TODO: pendiente elminar todos los datos relacionados con ese id
    console.log('recibo este id en el controller', id);
    return this.userModel.deleteUser(id);
  }
}
