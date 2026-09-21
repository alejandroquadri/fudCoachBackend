import { UserProfile } from '../../types';
import type { PreferenceListChange } from './ai-actions.service';

export const normalizePreferenceList = (values: unknown[]) => {
  const seen = new Set<string>();
  return values.flatMap(value => {
    const normalized = String(value).trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
};

export const applyPreferenceListChange = (
  current: unknown,
  change: PreferenceListChange
) => {
  const existing = normalizePreferenceList(
    Array.isArray(current) ? current : []
  );
  const values = normalizePreferenceList(change.values);
  if (change.operation === 'replace') return values;
  if (change.operation === 'remove') {
    const removed = new Set(values.map(value => value.toLowerCase()));
    return existing.filter(value => !removed.has(value.toLowerCase()));
  }
  return normalizePreferenceList([...existing, ...values]);
};

export const toAgentProfile = (user: UserProfile): Record<string, unknown> => {
  const profile: Record<string, unknown> = { ...user };
  const privateFields: Array<keyof UserProfile> = [
    '_id',
    'email',
    'password',
    'providers',
    'appleSub',
    'appleEmailPrivateRelay',
    'appAccountToken',
    'entitlement',
    'createdAt',
    'updatedAt',
  ];
  for (const field of privateFields) delete profile[field];
  return profile;
};
