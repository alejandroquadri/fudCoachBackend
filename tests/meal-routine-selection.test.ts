import assert from 'node:assert/strict';
import test from 'node:test';
import { selectMealRoutine } from '../src/services/ai/meal-routine-selection';

test('selects a weekday routine using the local day, not the UTC day', () => {
  const routines = [
    { id: 'weekdays', meal: 'lunch', weekdays: [1, 2, 3, 4, 5] },
    { id: 'weekend', meal: 'lunch', weekdays: [6, 7] },
  ];
  const time = new Date('2026-11-07T01:00:00Z'); // Friday in Buenos Aires.
  assert.deepEqual(
    selectMealRoutine(
      routines,
      'lunch',
      'America/Argentina/Buenos_Aires',
      time
    ),
    { outcome: 'match', routine: routines[0] }
  );
  assert.deepEqual(selectMealRoutine(routines, 'lunch', 'Asia/Tokyo', time), {
    outcome: 'match',
    routine: routines[1],
  });
  assert.deepEqual(selectMealRoutine(routines, 'lunch', undefined, time), {
    outcome: 'timezone_required',
  });
  assert.deepEqual(selectMealRoutine(routines, 'lunch', 'invalid/zone', time), {
    outcome: 'timezone_required',
  });
});

test('asks rather than selecting arbitrarily among overlapping routines', () => {
  const routines = [
    { id: 'a', meal: 'breakfast', weekdays: [5] },
    { id: 'b', meal: 'breakfast', weekdays: [5] },
    { id: 'fallback', meal: 'breakfast', weekdays: [] },
  ];
  assert.deepEqual(
    selectMealRoutine(
      routines,
      'breakfast',
      'UTC',
      new Date('2026-11-06T12:00:00Z')
    ),
    { outcome: 'ambiguous' }
  );
  assert.deepEqual(
    selectMealRoutine(
      routines,
      'breakfast',
      'UTC',
      new Date('2026-11-07T12:00:00Z')
    ),
    { outcome: 'match', routine: routines[2] }
  );
});
