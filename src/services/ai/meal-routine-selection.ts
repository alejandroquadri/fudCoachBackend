export type MealRoutine = {
  id: string;
  meal: string;
  // ISO weekdays: Monday is 1, Sunday is 7. An empty list means every day.
  weekdays: number[];
};

export type MealRoutineSelection<T> =
  | { outcome: 'match'; routine: T }
  | { outcome: 'missing' | 'ambiguous' | 'timezone_required' };

/** Resolve a routine without silently guessing the user's current weekday. */
export function selectMealRoutine<T extends MealRoutine>(
  routines: T[],
  meal: string,
  timeZone: string | undefined,
  now: Date
): MealRoutineSelection<T> {
  const candidates = routines.filter(routine => routine.meal === meal);
  if (!candidates.length) return { outcome: 'missing' };
  const scheduled = candidates.filter(routine => routine.weekdays.length > 0);
  if (!scheduled.length)
    return candidates.length === 1
      ? { outcome: 'match', routine: candidates[0] }
      : { outcome: 'ambiguous' };
  if (!timeZone) return { outcome: 'timezone_required' };
  let weekday: number;
  try {
    const day = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone,
    }).format(now);
    weekday =
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(day) + 1;
    if (!weekday) return { outcome: 'timezone_required' };
  } catch {
    return { outcome: 'timezone_required' };
  }
  const matches = scheduled.filter(routine =>
    routine.weekdays.includes(weekday)
  );
  if (matches.length > 1) return { outcome: 'ambiguous' };
  if (matches.length === 1) return { outcome: 'match', routine: matches[0] };
  const everyday = candidates.filter(routine => !routine.weekdays.length);
  return everyday.length === 1
    ? { outcome: 'match', routine: everyday[0] }
    : { outcome: everyday.length ? 'ambiguous' : 'missing' };
}
