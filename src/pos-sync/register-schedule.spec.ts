import {
  isWithinOpeningHours,
  lastScheduledClose,
  parseScheduleTime,
} from './register-schedule';

// EAT is UTC+3: 07:00 EAT = 04:00Z.
const eat = (hhmm: string, day = '2026-10-16') => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, Number(day.slice(8)), h - 3, m));
};

describe('register schedule', () => {
  it('finds the last opening time that has struck: 00:00 EAT is 21:00Z the day before', () => {
    const { lastScheduledOpen } = require('./register-schedule');
    expect(lastScheduledOpen('00:00', new Date('2026-10-18T07:15:00Z')).toISOString()).toBe('2026-10-17T21:00:00.000Z');
    expect(lastScheduledOpen(null, new Date())).toBeNull();
  });

  it('parses HH:MM and refuses anything else', () => {
    expect(parseScheduleTime('07:30')).toBe(450);
    expect(parseScheduleTime('24:00')).toBeNull();
    expect(parseScheduleTime('')).toBeNull();
    expect(parseScheduleTime(null)).toBeNull();
  });

  it('finds the last closing time that has struck, today or yesterday', () => {
    expect(lastScheduledClose('22:00', eat('22:05'))?.toISOString()).toBe(
      eat('22:00').toISOString(),
    );
    // At 08:00 the last close was yesterday at 22:00.
    expect(lastScheduledClose('22:00', eat('08:00'))?.toISOString()).toBe(
      eat('22:00', '2026-10-15').toISOString(),
    );
    expect(lastScheduledClose(null, eat('08:00'))).toBeNull();
  });

  it('keeps a same-day window: closed from 22:00 to 07:00', () => {
    const s = { opensAt: '07:00', closesAt: '22:00' };
    expect(isWithinOpeningHours(s, eat('06:59'))).toBe(false);
    expect(isWithinOpeningHours(s, eat('07:00'))).toBe(true);
    expect(isWithinOpeningHours(s, eat('21:59'))).toBe(true);
    expect(isWithinOpeningHours(s, eat('22:00'))).toBe(false);
    expect(isWithinOpeningHours(s, eat('23:30'))).toBe(false);
  });

  it('keeps a late-night shop: closes 02:00, opens 07:00', () => {
    const s = { opensAt: '07:00', closesAt: '02:00' };
    expect(isWithinOpeningHours(s, eat('01:00'))).toBe(true);
    expect(isWithinOpeningHours(s, eat('03:00'))).toBe(false);
    expect(isWithinOpeningHours(s, eat('12:00'))).toBe(true);
  });

  it('with only an opening time, closed hours run from midnight', () => {
    expect(isWithinOpeningHours({ opensAt: '07:00' }, eat('05:00'))).toBe(
      false,
    );
    expect(isWithinOpeningHours({ opensAt: '07:00' }, eat('23:00'))).toBe(true);
  });

  it('with only a closing time, opening is never refused', () => {
    expect(isWithinOpeningHours({ closesAt: '22:00' }, eat('23:00'))).toBe(
      true,
    );
  });
});
