import {
  bellWeekdays,
  isLeaveApprover,
  rangesOverlap,
  schoolDaysBetween,
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
