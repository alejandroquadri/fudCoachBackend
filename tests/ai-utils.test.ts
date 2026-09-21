import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectId } from 'mongodb';
import {
  applyPreferenceListChange,
  normalizePreferenceList,
  toAgentProfile,
} from '../src/services/ai/ai-utils';
import { UserProfile } from '../src/types';

test('normalizes preference lists without changing their order', () => {
  assert.deepEqual(
    normalizePreferenceList([' Olives ', 'Mayo', 'olives', '', ' mayo ']),
    ['Olives', 'Mayo']
  );
});

test('supports add, remove, and replace semantics for preferences', () => {
  assert.deepEqual(
    applyPreferenceListChange(['Broccoli'], {
      operation: 'add',
      values: ['olives', 'BROCCOLI'],
    }),
    ['Broccoli', 'olives']
  );
  assert.deepEqual(
    applyPreferenceListChange(['Broccoli', 'Olives'], {
      operation: 'remove',
      values: ['olives'],
    }),
    ['Broccoli']
  );
  assert.deepEqual(
    applyPreferenceListChange(['Broccoli'], {
      operation: 'replace',
      values: ['Pasta', 'pasta', 'Fish'],
    }),
    ['Pasta', 'Fish']
  );
});

test('excludes credentials and subscription data from model context', () => {
  const user = {
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
    name: 'Alex',
    email: 'alex@example.com',
    password: 'hash',
    appAccountToken: 'private-token',
    entitlement: { active: true },
    gender: 'male',
    lifeStyle: 1.2,
    activityLevel: 'low',
    triedOtherApps: false,
    unitType: 'metric',
    initWeight: 80,
    height: 180,
    birthdate: '1990-01-01',
    goal: 'maintain',
    weightGoal: 80,
    goalVelocity: 0,
    goalObstacle: 'time',
    dietType: 'classic',
    outcome: 'energy',
    nutritionGoals: {
      tdee: 2400,
      bmr: 1800,
      dailyCaloricTarget: 2200,
      dailyCarbsTarget: 250,
      dailyProteinTarget: 150,
      dailyFatTarget: 65,
    },
    likes: ['fish'],
  } as UserProfile;

  const profile = toAgentProfile(user);
  assert.equal(profile.name, 'Alex');
  assert.deepEqual(profile.likes, ['fish']);
  assert.equal('email' in profile, false);
  assert.equal('password' in profile, false);
  assert.equal('appAccountToken' in profile, false);
  assert.equal('entitlement' in profile, false);
});
