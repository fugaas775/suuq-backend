import {
  bellWeekdays,
  countsAgainstAllowance,
  ethiopianNewYear,
  isEthiopianCountry,
  isLeaveApprover,
  leaveAllowanceDays,
  leaveAllowanceStanding,
  rangesOverlap,
  schoolDaysBetween,
  schoolDaysWithin,
  schoolYearRangeOf,
  schoolYearsTouched,
} from './school-leave.policy';

describe('isLeaveApprover', () => {
  const base = { actorId: 10, ownerId: 1, roles: [] as string[] };

  it('is the owner, a platform admin, a MANAGER login, or the capability', () => {
    expect(isLeaveApprover({ ...base, actorId: 1 })).toBe(true);
    expect(isLeaveApprover({ ...base, roles: ['SUPER_ADMIN'] })).toBe(true);
    expect(
      isLeaveApprover({ ...base, assignment: { role: 'MANAGER', isActive: true } }),
    ).toBe(true);
    expect(
      isLeaveApprover({
        ...base,
        assignment: {
          role: 'OPERATOR',
          isActive: true,
          capabilities: ['APPROVE_STAFF_LEAVE'],
        },
      }),
    ).toBe(true);
    // An ACCOUNT session's POS_MANAGER is global — it is not a head here.
    expect(isLeaveApprover({ ...base, roles: ['POS_MANAGER'] })).toBe(false);
    expect(
      isLeaveApprover({ ...base, assignment: { role: 'MANAGER', isActive: false } }),
    ).toBe(false);
  });

  it('is a head by job title on the staff register — and not a teacher, nor a leaver', () => {
    for (const jobTitle of [
      'Director',
      'Deputy Director',
      'General Director',
      'Principal',
      'Head teacher',
      'Headmaster',
      'General Manager',
      'Agaasime',
      'Mudiir',
    ]) {
      expect(isLeaveApprover({ ...base, employee: { jobTitle } })).toBe(true);
    }
    expect(isLeaveApprover({ ...base, employee: { jobTitle: 'Teacher' } })).toBe(false);
    expect(isLeaveApprover({ ...base, employee: { jobTitle: 'Cashier' } })).toBe(false);
    expect(
      isLeaveApprover({
        ...base,
        employee: { jobTitle: 'Director', status: 'INACTIVE' },
      }),
    ).toBe(false);
    expect(isLeaveApprover({ ...base, actorId: null })).toBe(false);
  });
});

describe('schoolDaysBetween', () => {
  it('counts the days the bell runs, Monday to Friday without a timetable', () => {
    // 2026-09-21 is a Monday.
    expect(schoolDaysBetween('2026-09-21', '2026-09-25', null)).toBe(5);
    expect(schoolDaysBetween('2026-09-21', '2026-09-27', null)).toBe(5);
    expect(schoolDaysBetween('2026-09-26', '2026-09-27', null)).toBe(0);
    expect(schoolDaysBetween('2026-09-21', '2026-09-21', null)).toBe(1);
    expect(schoolDaysBetween('2026-09-25', '2026-09-21', null)).toBe(0);
  });

  it('reads a six-day bell from the timetable, lessons before breaks', () => {
    const bell = [
      { code: 'P1', kind: 'LESSON', days: [1, 2, 3, 4, 5, 6] },
      { code: 'B1', kind: 'BREAK', days: [1, 2, 3, 4, 5, 6, 7] },
    ];
    const days = bellWeekdays(bell);
    expect([...days].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(schoolDaysBetween('2026-09-21', '2026-09-27', days)).toBe(6);
    expect(bellWeekdays([]).size).toBe(0);
  });
});

describe('rangesOverlap', () => {
  it('shares a day, inclusive at both ends', () => {
    const a = { startDate: '2026-09-21', endDate: '2026-09-23' };
    expect(rangesOverlap(a, { startDate: '2026-09-23', endDate: '2026-09-30' })).toBe(true);
    expect(rangesOverlap(a, { startDate: '2026-09-24', endDate: '2026-09-30' })).toBe(false);
    expect(rangesOverlap(a, { startDate: '2026-09-01', endDate: '2026-09-21' })).toBe(true);
  });
});

/* The year's allowance: a tenth of its school days, on the school's own
   calendar. Owner 2026-10-06: "Teachers should only have a 10% annual
   leave, if it is more than it should not be tolerated." */
describe('the school year', () => {
  it('opens at Meskerem 1 for an Ethiopian school — 11 September, the 12th before a Gregorian leap year — and on 1 September otherwise', () => {
    expect(ethiopianNewYear(2026)).toBe('2026-09-11');
    expect(ethiopianNewYear(2027)).toBe('2027-09-12');
    expect(ethiopianNewYear(2023)).toBe('2023-09-12');
    // 2019 E.C. is a leap year: six days of Pagume, so it runs to 11 September 2027.
    expect(schoolYearRangeOf('2026-09-22', true)).toEqual({ from: '2026-09-11', to: '2027-09-11', label: '2019 E.C.' });
    expect(schoolYearRangeOf('2027-03-01', true)).toEqual({ from: '2026-09-11', to: '2027-09-11', label: '2019 E.C.' });
    expect(schoolYearRangeOf('2027-09-11', true)).toEqual({ from: '2026-09-11', to: '2027-09-11', label: '2019 E.C.' });
    expect(schoolYearRangeOf('2027-09-12', true)).toEqual({ from: '2027-09-12', to: '2028-09-10', label: '2020 E.C.' });
    expect(schoolYearRangeOf('2026-09-05', true)).toEqual({ from: '2025-09-11', to: '2026-09-10', label: '2018 E.C.' });
    expect(schoolYearRangeOf('2026-09-22', false)).toEqual({ from: '2026-09-01', to: '2027-08-31', label: '2026/2027' });
    expect(schoolYearRangeOf('2027-03-01', false)).toEqual({ from: '2026-09-01', to: '2027-08-31', label: '2026/2027' });
    expect(isEthiopianCountry('Ethiopia')).toBe(true);
    expect(isEthiopianCountry(' ET ')).toBe(true);
    expect(isEthiopianCountry('Itoobiya')).toBe(true);
    expect(isEthiopianCountry('Kenya')).toBe(false);
    expect(isEthiopianCountry(null)).toBe(false);
  });

  it('names every year a request touches — two over the New Year', () => {
    expect(schoolYearsTouched('2026-10-05', '2026-10-09', true).map((y) => y.label)).toEqual(['2019 E.C.']);
    expect(schoolYearsTouched('2027-09-06', '2027-09-17', true).map((y) => y.label)).toEqual(['2019 E.C.', '2020 E.C.']);
    expect(schoolYearsTouched('2027-08-30', '2027-09-03', false).map((y) => y.label)).toEqual(['2026/2027', '2027/2028']);
  });
});

describe('the leave allowance', () => {
  it('is a tenth of the year’s school days, whole days only, and only annual, personal, study, unpaid and other leave draw on it', () => {
    // 2026-09-01 to 2027-08-31, Monday to Friday: 261 school days.
    expect(schoolDaysBetween('2026-09-01', '2027-08-31', null)).toBe(261);
    expect(leaveAllowanceDays(261)).toBe(26);
    expect(leaveAllowanceDays(200)).toBe(20);
    expect(leaveAllowanceDays(9)).toBe(0);
    expect(leaveAllowanceDays(0)).toBe(0);
    expect(leaveAllowanceDays(-5)).toBe(0);
    for (const kind of ['ANNUAL', 'PERSONAL', 'STUDY', 'UNPAID', 'OTHER', 'annual']) {
      expect(countsAgainstAllowance(kind)).toBe(true);
    }
    for (const kind of ['SICK', 'MATERNITY', 'PATERNITY', 'BEREAVEMENT', '', null]) {
      expect(countsAgainstAllowance(kind)).toBe(false);
    }
  });

  it('counts a request’s days inside a window — the frozen count when it lies within, the bell for the part inside when it straddles', () => {
    const window = { from: '2026-09-01', to: '2027-08-31' };
    expect(schoolDaysWithin({ startDate: '2026-10-05', endDate: '2026-10-09', schoolDays: 5 }, window, null)).toBe(5);
    // 2027-08-30 (Mon) to 2027-09-03 (Fri): two days inside the window, three outside.
    expect(schoolDaysWithin({ startDate: '2027-08-30', endDate: '2027-09-03', schoolDays: 5 }, window, null)).toBe(2);
    expect(schoolDaysWithin({ startDate: '2027-09-06', endDate: '2027-09-10', schoolDays: 5 }, window, null)).toBe(0);
  });

  it('states where a person stands: approved and pending days of the counted kinds, inside the year, with sick leave left out', () => {
    const year = schoolYearRangeOf('2026-09-22', false);
    const rows = [
      { id: 1, status: 'APPROVED', leaveType: 'ANNUAL', startDate: '2026-10-05', endDate: '2026-10-16', schoolDays: 10 },
      { id: 2, status: 'APPROVED', leaveType: 'SICK', startDate: '2026-11-02', endDate: '2026-11-06', schoolDays: 5 },
      { id: 3, status: 'PENDING', leaveType: 'PERSONAL', startDate: '2026-12-07', endDate: '2026-12-08', schoolDays: 2 },
      { id: 4, status: 'REJECTED', leaveType: 'ANNUAL', startDate: '2027-01-11', endDate: '2027-01-15', schoolDays: 5 },
      { id: 5, status: 'CANCELLED', leaveType: 'ANNUAL', startDate: '2027-02-01', endDate: '2027-02-05', schoolDays: 5 },
      // Straddles the New Year: two of its five days are this year's.
      { id: 6, status: 'APPROVED', leaveType: 'ANNUAL', startDate: '2027-08-30', endDate: '2027-09-03', schoolDays: 5 },
    ];
    expect(leaveAllowanceStanding({ rows, year, weekdays: null })).toEqual({
      year,
      yearDays: 261,
      allowanceDays: 26,
      rate: 0.1,
      approvedDays: 12,
      pendingDays: 2,
      leftDays: 12,
    });
    // The row being decided is left out of its own count.
    expect(leaveAllowanceStanding({ rows, year, weekdays: null, excludeId: 3 }).pendingDays).toBe(0);
    // Nothing left is nothing, never a negative.
    const heavy = [{ id: 9, status: 'APPROVED', leaveType: 'STUDY', startDate: '2026-10-01', endDate: '2026-11-30', schoolDays: 43 }];
    expect(leaveAllowanceStanding({ rows: heavy, year, weekdays: null }).leftDays).toBe(0);
  });
});
