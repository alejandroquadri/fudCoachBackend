import assert from 'node:assert/strict';
import test from 'node:test';
import { mongoInstance } from '../src/connection';
import { AiActionsService } from '../src/services/ai/ai-actions.service';
import { AiFoodLogPayload, AiRunOperation } from '../src/types';

test('meal writes and the recovery payload share a transaction and retries return the saved payload', async () => {
  const originalClient = mongoInstance.client;
  let operations: AiRunOperation[] = [];
  let foods: unknown[] = [];
  let failCommitRecord = true;
  const session = {
    withTransaction: async (operation: () => Promise<void>) => {
      const originalFoods = [...foods];
      const originalOperations = [...operations];
      try {
        await operation();
      } catch (error) {
        foods = originalFoods;
        operations = originalOperations;
        throw error;
      }
    },
    endSession: async () => {},
  };
  const db = {
    collection: (name: string) =>
      name === 'notificationSettings'
        ? {
            find: () => ({
              project: () => ({
                limit: () => ({
                  toArray: async () => [
                    { timezone: 'America/Argentina/Buenos_Aires' },
                  ],
                }),
              }),
            }),
          }
        : name === 'foodLogs'
        ? {
            insertMany: async (
              documents: unknown[],
              options: { session: unknown }
            ) => {
              assert.equal(options.session, session);
              foods.push(...documents);
            },
          }
        : {
            findOne: async (
              _filter: unknown,
              options: { session: unknown }
            ) => {
              assert.equal(options.session, session);
              return { operations };
            },
            updateOne: async (
              _filter: unknown,
              update: { $push: { operations: AiRunOperation } },
              options: { session: unknown }
            ) => {
              assert.equal(options.session, session);
              if (failCommitRecord)
                throw new Error('Transaction record failed');
              operations.push(update.$push.operations);
            },
          },
  };
  Object.defineProperty(mongoInstance, 'db', { configurable: true, value: db });
  mongoInstance.client = {
    startSession: () => session,
  } as unknown as typeof mongoInstance.client;
  const first: AiFoodLogPayload = {
    name: 'Rice',
    quantity: 1,
    serving_size: 'medium',
    calories: 195,
    protein: 4,
    carbs: 42,
    fat: 0.4,
  };
  try {
    const actions = new AiActionsService();
    await assert.rejects(
      actions.logMeals('run', '507f1f77bcf86cd799439011', [first]),
      /Transaction record failed/
    );
    assert.equal(foods.length, 0);
    assert.equal(operations.length, 0);
    failCommitRecord = false;
    const saved = await actions.logMeals('run', '507f1f77bcf86cd799439011', [
      first,
    ]);
    const retry = await actions.logMeals('run', '507f1f77bcf86cd799439011', [
      { ...first, calories: 999 },
    ]);
    assert.deepEqual(retry, saved);
    assert.equal(retry.meals[0].calories, 195);
    assert.equal(foods.length, 1);
    assert.equal((foods[0] as { mealGroupId: string }).mealGroupId, 'run');
    assert.equal(
      (foods[0] as { loggedTimeZone: string }).loggedTimeZone,
      'America/Argentina/Buenos_Aires'
    );
    assert.match(
      (foods[0] as { loggedLocalDateTime: string }).loggedLocalDateTime,
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/
    );
    assert.equal(operations.length, 1);
  } finally {
    delete (mongoInstance as unknown as Record<string, unknown>).db;
    mongoInstance.client = originalClient;
  }
});
