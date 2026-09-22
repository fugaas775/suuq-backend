import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsCalendarDay, isCalendarDay } from './is-calendar-day.validator';

class Probe {
  @IsCalendarDay()
  day!: string;
}

const errorsFor = (day: unknown) =>
  validateSync(plainToInstance(Probe, { day })).length;

describe('isCalendarDay', () => {
  it('accepts real days, including a leap day in a leap year', () => {
    expect(isCalendarDay('2026-09-22')).toBe(true);
    expect(isCalendarDay('2028-02-29')).toBe(true);
    expect(isCalendarDay('2026-12-31')).toBe(true);
  });

  it('refuses days the calendar does not have', () => {
    expect(isCalendarDay('2026-02-30')).toBe(false);
    expect(isCalendarDay('2026-02-29')).toBe(false);
    expect(isCalendarDay('2026-04-31')).toBe(false);
    expect(isCalendarDay('2026-13-01')).toBe(false);
    expect(isCalendarDay('2026-00-10')).toBe(false);
    expect(isCalendarDay('2026-09-00')).toBe(false);
  });

  it('refuses every other ISO spelling — a week date, a timestamp, a short form', () => {
    expect(isCalendarDay('2026-W38-1')).toBe(false);
    expect(isCalendarDay('2026-09-22T00:00:00Z')).toBe(false);
    expect(isCalendarDay('2026-9-22')).toBe(false);
    expect(isCalendarDay('20260922')).toBe(false);
    expect(isCalendarDay('')).toBe(false);
    expect(isCalendarDay(20260922)).toBe(false);
    expect(isCalendarDay(null)).toBe(false);
  });

  it('works as a DTO decorator', () => {
    expect(errorsFor('2026-09-22')).toBe(0);
    expect(errorsFor('2026-02-30')).toBe(1);
    expect(errorsFor('2026-W38-1')).toBe(1);
  });
});
