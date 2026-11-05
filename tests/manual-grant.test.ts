import assert from 'node:assert/strict';
import test from 'node:test';
import { Request, Response } from 'express';
import { requireActiveEntitlement } from '../src/middlewares/require-active-entitlement.middleware';
import { UserProfile } from '../src/types';

const accessAllowed = (user: unknown) => {
  let allowed = false;
  let status = 0;
  const res = {
    status: (value: number) => {
      status = value;
      return { json: () => undefined };
    },
  } as unknown as Response;
  requireActiveEntitlement({ user } as Request, res, () => { allowed = true; });
  return { allowed, status };
};

test('manual grant allows access independently of subscription state', () => {
  assert.equal(accessAllowed({ grant: true }).allowed, true);
  assert.equal(accessAllowed({ grant: true, entitlement: { active: false } }).allowed, true);
  for (const grant of [false, 'true', undefined]) {
    assert.deepEqual(accessAllowed({ grant }), { allowed: false, status: 403 });
  }
  assert.equal(accessAllowed({ entitlement: { active: true, expiresAtISO: '2999-01-01' } }).allowed, true);
  assert.equal(accessAllowed({ entitlement: { active: true, expiresAtISO: '2000-01-01' } }).allowed, false);
});

test('entitlement endpoint reports manual grant without Apple or database writes', async () => {
  await import('../src/services/ai/ai-agent.service');
  const { IapController } = await import('../src/controllers/iap.controller');
  const controller = Object.create(IapController.prototype) as IapController;
  (controller as any).userController = { ensureAppAccountToken: async (user: UserProfile) => user };
  const user = { _id: '123', appAccountToken: 'token', grant: true, entitlement: { active: false } } as UserProfile;
  const result = await controller.getCurrentEntitlement(user);
  assert.equal(result.entitlement?.active, true);
  assert.equal(result.entitlement?.originalTransactionId, 'manual');
  assert.equal(user.entitlement?.active, false);
});
