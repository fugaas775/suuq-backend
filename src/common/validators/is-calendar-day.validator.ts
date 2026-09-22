import { ValidationOptions, registerDecorator } from 'class-validator';

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whether `value` is a day that exists on the calendar, spelled `YYYY-MM-DD`.
 *
 * `@IsISO8601()` and `@Matches(/^\d{4}-\d{2}-\d{2}$/)` both let impossible
 * days through: the first accepts week dates ("2026-W38-1") and whole
 * timestamps, the second accepts "2026-02-30". Postgres then either refuses
 * the date column with a 500 or — worse, for a `from`/`to` range — quietly
 * rolls it into March, and a register filed under a day nobody can pick again
 * is a register nobody can find. A school day is a plain Gregorian date; this
 * is the one check every SCHOOL and attendance DTO uses for one.
 *
 * Checked by round-tripping through a UTC date: Feb 29 exists only in leap
 * years, the 31st only in the long months, and the parse cannot drift a day
 * because no time zone is ever involved.
 */
export function isCalendarDay(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = DAY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(0);
  // setUTCFullYear, not Date.UTC: the latter maps years 0–99 onto 1900–1999.
  probe.setUTCFullYear(year, month - 1, day);
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** Property decorator: a real calendar day in `YYYY-MM-DD` — see {@link isCalendarDay}. */
export function IsCalendarDay(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCalendarDay',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a real calendar day written YYYY-MM-DD`,
        ...options,
      },
      validator: {
        validate: (value: unknown) => isCalendarDay(value),
      },
    });
  };
}
