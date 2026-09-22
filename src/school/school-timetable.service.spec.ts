import { BadRequestException, ConflictException } from '@nestjs/common';
import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  SchoolTimetableService,
  normalizePersonName,
} from './school-timetable.service';
import {
  PutSchoolTimetableDto,
  isPeriodTimes,
} from './dto/school-timetable.dto';

/**
 * The timetable's rules: class codes come from the registry, a teacher is in
 * one room at a time, a class has one lesson per period, and a bare name links
 * to exactly one employee or to nobody.
 */

const stamp = new Date('2026-09-16T08:00:00.000Z');

function makeService({
  employeeFind = null,
  registry = [
    { id: 4, code: '1aad', sortOrder: 10 },
    { id: 6, code: '3aad', sortOrder: 30 },
    { id: 10, code: '7th', sortOrder: 70 },
  ],
  employees = [
    { id: 5, fullName: 'Tamasgeen Esheetu', status: 'ACTIVE' },
    { id: 8, fullName: 'Ibrahim Ahmad', status: 'ACTIVE' },
    { id: 30, fullName: 'Mustafe', status: 'ACTIVE' },
    { id: 31, fullName: 'Mustafe', status: 'ACTIVE' },
    { id: 40, fullName: 'Left Teacher', status: 'INACTIVE' },
  ],
  existing = null,
}: any = {}) {
  const saved: any[] = [];
  const reads: any[] = [];
  const repo: any = {
    findOne: async (opts: any) => {
      reads.push(opts);
      return existing;
    },
    create: (partial: any) => ({ ...partial }),
    save: async (row: any) => {
      saved.push(row);
      return { id: 1, createdAt: stamp, updatedAt: stamp, ...row };
    },
  };
  // The week is replaced inside a transaction whose manager hands back the
  // same repository, so every read and write stays observable.
  repo.manager = {
    transaction: async (fn: any) => fn({ getRepository: () => repo }),
  };
  const classes: any = { find: async () => registry };
  const staff: any = {
    find: async (opts?: any) =>
      opts?.where?.userId != null
        ? employees.filter(
            (e: any) => Number(e.userId) === Number(opts.where.userId),
          )
        : employees,
  };
  void employeeFind;
  const svc = new SchoolTimetableService(repo, classes, staff);
  return { svc, saved, reads };
}

const PERIODS = [
  {
    code: 'P1',
    sortOrder: 1,
    times: { '*': { start: '08:00', end: '08:40' } },
  },
  {
    code: 'P2',
    sortOrder: 2,
    times: { '*': { start: '08:40', end: '09:20' } },
  },
  { code: 'Break', kind: 'BREAK', sortOrder: 3 },
  { code: 'P4', sortOrder: 4, days: [1, 2, 3, 4] },
];

describe('SchoolTimetableService', () => {
  it('reads an empty document for a branch with no timetable', async () => {
    const { svc } = makeService();
    const doc = await svc.get(115);
    expect(doc).toMatchObject({
      id: null,
      branchId: 115,
      periods: [],
      slots: [],
    });
  });

  it('canonicalises class codes to the registry spelling and links a bare name to its one employee', async () => {
    const { svc, saved } = makeService();
    const doc = await svc.put(
      {
        branchId: 115,
        periods: PERIODS,
        slots: [
          {
            day: 1,
            period: 'p1',
            classCode: '3AAD',
            subject: 'Amharic',
            teacherName: 'Temesgen  Eshetu',
          },
          {
            day: 1,
            period: 'P1',
            classCode: '1aad',
            subject: 'Mathematics',
            employeeId: 8,
          },
        ],
      } as any,
      77,
    );
    expect(saved).toHaveLength(1);
    expect(doc.slots).toEqual([
      // Sorted by day, period, then the registry's teaching order.
      expect.objectContaining({
        classCode: '1aad',
        period: 'P1',
        teacherName: 'Ibrahim Ahmad',
        employeeId: 8,
      }),
      expect.objectContaining({
        classCode: '3aad',
        period: 'P1',
        subject: 'Amharic',
        employeeId: null,
        teacherName: 'Temesgen Eshetu',
      }),
    ]);
    expect(doc.updatedByUserId).toBe(77);
  });

  it('links a bare name spelled with punctuation and case drift to one active employee', async () => {
    const { svc } = makeService();
    const doc = await svc.put(
      {
        branchId: 115,
        periods: PERIODS,
        slots: [
          {
            day: 2,
            period: 'P2',
            classCode: '7th',
            subject: 'Amharic',
            teacherName: 'TAMASGEEN, ESHEETU',
          },
        ],
      } as any,
      null,
    );
    expect(doc.slots[0]).toMatchObject({
      employeeId: 5,
      teacherName: 'TAMASGEEN, ESHEETU',
    });
  });

  it('leaves a name that matches two employees unlinked rather than guessing', async () => {
    const { svc } = makeService();
    const doc = await svc.put(
      {
        branchId: 115,
        periods: PERIODS,
        slots: [
          {
            day: 1,
            period: 'P1',
            classCode: '1aad',
            subject: 'Arabic',
            teacherName: 'Mustafe',
          },
        ],
      } as any,
      null,
    );
    expect(doc.slots[0].employeeId).toBeNull();
  });

  it('does not link a bare name to somebody who has left', async () => {
    const { svc } = makeService();
    const doc = await svc.put(
      {
        branchId: 115,
        periods: PERIODS,
        slots: [
          {
            day: 1,
            period: 'P1',
            classCode: '1aad',
            subject: 'Arabic',
            teacherName: 'Left Teacher',
          },
        ],
      } as any,
      null,
    );
    expect(doc.slots[0].employeeId).toBeNull();
  });

  it('refuses a class the registry does not know', async () => {
    const { svc } = makeService();
    await expect(
      svc.put(
        {
          branchId: 115,
          periods: PERIODS,
          slots: [{ day: 1, period: 'P1', classCode: 'Grade 3', subject: 'X' }],
        } as any,
        null,
      ),
    ).rejects.toThrow(/"Grade 3" is not a class/);
  });

  it('refuses an employee who is not on this branch', async () => {
    const { svc } = makeService();
    await expect(
      svc.put(
        {
          branchId: 115,
          periods: PERIODS,
          slots: [
            {
              day: 1,
              period: 'P1',
              classCode: '1aad',
              subject: 'X',
              employeeId: 999,
            },
          ],
        } as any,
        null,
      ),
    ).rejects.toThrow(/Employee #999/);
  });

  it('refuses a teacher in two classes at once, however the name is spelled', async () => {
    const { svc } = makeService();
    await expect(
      svc.put(
        {
          branchId: 115,
          periods: PERIODS,
          slots: [
            {
              day: 3,
              period: 'P2',
              classCode: '1aad',
              subject: 'Maths',
              employeeId: 8,
            },
            {
              day: 3,
              period: 'P2',
              classCode: '3aad',
              subject: 'Maths',
              teacherName: 'ibrahim ahmad',
            },
          ],
        } as any,
        null,
      ),
    ).rejects.toThrow(/in 1aad and 3aad at the same time on Wednesday P2/);
  });

  /**
   * The first SMAQ import was refused for "Temesgen Eshetu is in 4aad and 6aad
   * at the same time on Monday P1" — 4aad sits in the morning shift (P1 at
   * 08:00) and 6aad in the afternoon (P1 at 14:00). Same bell, different hours.
   */
  it('lets a teacher hold the same period code in two shifts that ring at different hours', async () => {
    const { svc } = makeService();
    const twoShift = [
      {
        code: 'P1',
        sortOrder: 1,
        times: {
          AM: { start: '08:00', end: '08:40' },
          PM: { start: '14:00', end: '14:40' },
        },
      },
    ];
    const shifts = [
      { code: 'AM', classCodes: ['1aad', '3aad'] },
      { code: 'PM', classCodes: ['7th'] },
    ];
    const doc = await svc.put(
      {
        branchId: 115,
        periods: twoShift,
        shifts,
        slots: [
          {
            day: 1,
            period: 'P1',
            classCode: '3aad',
            subject: 'Amharic',
            employeeId: 5,
          },
          {
            day: 1,
            period: 'P1',
            classCode: '7th',
            subject: 'Amharic',
            employeeId: 5,
          },
        ],
      },
      null,
    );
    expect(doc.slots).toHaveLength(2);

    // Inside one shift the same period code IS the same time.
    await expect(
      svc.put(
        {
          branchId: 115,
          periods: twoShift,
          shifts,
          slots: [
            {
              day: 1,
              period: 'P1',
              classCode: '1aad',
              subject: 'Amharic',
              employeeId: 5,
            },
            {
              day: 1,
              period: 'P1',
              classCode: '3aad',
              subject: 'Amharic',
              employeeId: 5,
            },
          ],
        } as any,
        null,
      ),
    ).rejects.toThrow(/in 1aad and 3aad at the same time on Monday P1/);

    // Two shifts that ring at the SAME hour are one time, whatever they are called.
    await expect(
      svc.put(
        {
          branchId: 115,
          periods: [
            {
              code: 'P1',
              sortOrder: 1,
              times: {
                AM: { start: '08:00', end: '08:40' },
                PM: { start: '08:00', end: '08:40' },
              },
            },
          ],
          shifts,
          slots: [
            {
              day: 1,
              period: 'P1',
              classCode: '3aad',
              subject: 'Amharic',
              employeeId: 5,
            },
            {
              day: 1,
              period: 'P1',
              classCode: '7th',
              subject: 'Amharic',
              employeeId: 5,
            },
          ],
        } as any,
        null,
      ),
    ).rejects.toThrow(/at the same time on Monday P1/);
  });

  it('refuses two lessons for one class in one period', async () => {
    const { svc } = makeService();
    await expect(
      svc.put(
        {
          branchId: 115,
          periods: PERIODS,
          slots: [
            { day: 1, period: 'P1', classCode: '1aad', subject: 'Maths' },
            { day: 1, period: 'P1', classCode: '1AAD', subject: 'Arabic' },
          ],
        } as any,
        null,
      ),
    ).rejects.toThrow(/1aad has two lessons on Monday P1/);
  });

  it('refuses a lesson on a break, on a day the period does not run, or on an unknown period', async () => {
    const { svc } = makeService();
    const base = { branchId: 115, periods: PERIODS };
    await expect(
      svc.put(
        {
          ...base,
          slots: [{ day: 1, period: 'Break', classCode: '1aad', subject: 'X' }],
        } as any,
        null,
      ),
    ).rejects.toThrow(/Break is a break/);
    await expect(
      svc.put(
        {
          ...base,
          slots: [{ day: 5, period: 'P4', classCode: '1aad', subject: 'X' }],
        } as any,
        null,
      ),
    ).rejects.toThrow(/P4 does not run on Friday/);
    await expect(
      svc.put(
        {
          ...base,
          slots: [{ day: 1, period: 'P9', classCode: '1aad', subject: 'X' }],
        } as any,
        null,
      ),
    ).rejects.toThrow(/"P9" is not on the bell schedule/);
  });

  it('refuses a bad clock time and a period listed twice', async () => {
    const { svc } = makeService();
    await expect(
      svc.put(
        {
          branchId: 115,
          periods: [
            { code: 'P1', times: { '*': { start: '8:00', end: '08:40' } } },
          ],
          slots: [],
        } as any,
        null,
      ),
    ).rejects.toThrow(/invalid time "8:00"/);
    await expect(
      svc.put(
        {
          branchId: 115,
          periods: [{ code: 'P1' }, { code: 'p1' }],
          slots: [],
        } as any,
        null,
      ),
    ).rejects.toThrow(/listed twice/);
  });

  it('keeps a vacancy: a slot naming nobody is stored, and never conflicts', async () => {
    const { svc } = makeService();
    const doc = await svc.put(
      {
        branchId: 115,
        periods: PERIODS,
        slots: [
          { day: 1, period: 'P1', classCode: '1aad', subject: 'Physics' },
          { day: 1, period: 'P1', classCode: '3aad', subject: 'Biology' },
        ],
      } as any,
      null,
    );
    expect(doc.slots.map((s) => s.teacherName)).toEqual([null, null]);
  });

  it('places each class in one shift and refuses a class in two', async () => {
    const { svc } = makeService();
    const ok = await svc.put(
      {
        branchId: 115,
        periods: PERIODS,
        shifts: [
          { code: 'am', label: 'Morning', classCodes: ['1AAD', '3aad'] },
          { code: 'pm', classCodes: ['7th'] },
        ],
        slots: [],
      } as any,
      null,
    );
    expect(ok.shifts).toEqual([
      { code: 'AM', label: 'Morning', classCodes: ['1aad', '3aad'] },
      { code: 'PM', label: null, classCodes: ['7th'] },
    ]);
    await expect(
      svc.put(
        {
          branchId: 115,
          periods: PERIODS,
          shifts: [
            { code: 'AM', classCodes: ['1aad'] },
            { code: 'PM', classCodes: ['1aad'] },
          ],
          slots: [],
        } as any,
        null,
      ),
    ).rejects.toThrow(/1aad is in both the AM and PM shifts/);
  });

  it('updates the existing row rather than inserting a second document', async () => {
    const existing = {
      id: 9,
      branchId: 115,
      periods: [],
      shifts: [],
      slots: [],
      createdAt: stamp,
      updatedAt: stamp,
    };
    const { svc, saved } = makeService({ existing });
    await svc.put({ branchId: 115, periods: PERIODS, slots: [] } as any, null);
    expect(saved[0]).toBe(existing);
  });

  it('is a BadRequest, not a 500, for every refusal', async () => {
    const { svc } = makeService();
    await expect(
      svc.put(
        {
          branchId: 115,
          periods: [],
          slots: [{ day: 1, period: 'P1', classCode: 'nope', subject: 'X' }],
        } as any,
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SchoolTimetableService — overlapping hours, and a week saved over another', () => {
  const twoShift = [
    {
      code: 'P1',
      sortOrder: 1,
      times: {
        AM: { start: '08:00', end: '08:40' },
        PM: { start: '12:20', end: '13:00' },
      },
    },
    {
      code: 'P6',
      sortOrder: 6,
      times: {
        AM: { start: '12:00', end: '12:40' },
        PM: { start: '16:00', end: '16:40' },
      },
    },
  ];
  const shifts = [
    { code: 'AM', classCodes: ['1aad', '3aad'] },
    { code: 'PM', classCodes: ['7th'] },
  ];

  it('refuses one teacher in two lessons whose hours overlap, naming both', async () => {
    const { svc } = makeService();
    await expect(
      svc.put(
        {
          branchId: 115,
          periods: twoShift,
          shifts,
          slots: [
            {
              day: 2,
              period: 'P6',
              classCode: '3aad',
              subject: 'Maths',
              employeeId: 8,
            },
            {
              day: 2,
              period: 'P1',
              classCode: '7th',
              subject: 'Maths',
              employeeId: 8,
            },
          ],
        } as any,
        null,
      ),
    ).rejects.toThrow(
      'Ibrahim Ahmad is in 3aad (P6 12:00–12:40) and 7th (P1 12:20–13:00) at the same time on Tuesday.',
    );
  });

  it('lets lessons that only touch — one ends as the next begins — stand', async () => {
    const { svc } = makeService();
    const doc = await svc.put(
      {
        branchId: 115,
        periods: [
          {
            code: 'P6',
            sortOrder: 6,
            times: {
              AM: { start: '12:00', end: '12:40' },
              PM: { start: '16:00', end: '16:40' },
            },
          },
          {
            code: 'P1',
            sortOrder: 1,
            times: {
              AM: { start: '08:00', end: '08:40' },
              PM: { start: '12:40', end: '13:20' },
            },
          },
        ],
        shifts,
        slots: [
          {
            day: 2,
            period: 'P6',
            classCode: '3aad',
            subject: 'M',
            employeeId: 8,
          },
          {
            day: 2,
            period: 'P1',
            classCode: '7th',
            subject: 'M',
            employeeId: 8,
          },
        ],
      },
      null,
    );
    expect(doc.slots).toHaveLength(2);
  });

  it('keeps the start-time rule where a bell has no end', async () => {
    const { svc } = makeService();
    await expect(
      svc.put(
        {
          branchId: 115,
          periods: [
            {
              code: 'P1',
              sortOrder: 1,
              times: { AM: { start: '08:00' }, PM: { start: '09:00' } },
            },
            {
              code: 'P2',
              sortOrder: 2,
              times: { AM: { start: '09:00' }, PM: { start: '10:00' } },
            },
          ],
          shifts,
          slots: [
            {
              day: 1,
              period: 'P2',
              classCode: '3aad',
              subject: 'M',
              employeeId: 8,
            },
            {
              day: 1,
              period: 'P1',
              classCode: '7th',
              subject: 'M',
              employeeId: 8,
            },
          ],
        } as any,
        null,
      ),
    ).rejects.toThrow(
      /in 3aad \(P2 09:00\) and 7th \(P1 09:00\) at the same time on Monday/,
    );
    // And a start-only bell 08:00 beside a full 08:30–09:10 does not overlap
    // by any rule it can be judged on.
    const doc = await svc.put(
      {
        branchId: 115,
        periods: [
          {
            code: 'P1',
            sortOrder: 1,
            times: {
              AM: { start: '08:00' },
              PM: { start: '08:30', end: '09:10' },
            },
          },
        ],
        shifts,
        slots: [
          {
            day: 1,
            period: 'P1',
            classCode: '3aad',
            subject: 'M',
            employeeId: 8,
          },
          {
            day: 1,
            period: 'P1',
            classCode: '7th',
            subject: 'M',
            employeeId: 8,
          },
        ],
      },
      null,
    );
    expect(doc.slots).toHaveLength(2);
  });

  it('reads the row under a lock and refuses a week planned over an older one — 409 TIMETABLE_CHANGED with the week as it stands', async () => {
    const existing = {
      id: 9,
      branchId: 115,
      title: 'Week A',
      periods: [],
      shifts: [],
      slots: [],
      createdAt: stamp,
      updatedAt: stamp,
    };
    const { svc, saved, reads } = makeService({ existing });
    const err = await svc
      .put(
        {
          branchId: 115,
          periods: PERIODS,
          slots: [],
          expectedUpdatedAt: '2026-09-16T07:00:00.000Z',
        } as any,
        null,
      )
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({
      code: 'TIMETABLE_CHANGED',
      details: { current: { id: 9, title: 'Week A' } },
    });
    expect(saved).toHaveLength(0);
    expect(reads[0].lock).toEqual({ mode: 'pessimistic_write' });

    await svc.put(
      {
        branchId: 115,
        periods: PERIODS,
        slots: [],
        expectedUpdatedAt: stamp.toISOString(),
      } as any,
      null,
    );
    expect(saved).toHaveLength(1);
  });

  it('takes a bare HH:MM as a start time', async () => {
    const { svc } = makeService();
    const doc = await svc.put(
      {
        branchId: 115,
        periods: [{ code: 'P1', times: { '*': '08:00' } }],
        slots: [],
      },
      null,
    );
    expect(doc.periods[0].times).toEqual({
      '*': { start: '08:00', end: null },
    });
  });
});

describe("PutSchoolTimetableDto — a period's times are bounded before they are walked", () => {
  it('accepts the shapes the timetable editor sends', () => {
    expect(isPeriodTimes({ '*': { start: '08:00', end: '08:40' } })).toBe(true);
    expect(
      isPeriodTimes({ AM: { start: null, end: null }, PM: { start: '14:00' } }),
    ).toBe(true);
    expect(isPeriodTimes({ AM: '08:00' })).toBe(true);
    expect(isPeriodTimes({})).toBe(true);
  });

  it('refuses too many keys, a long key, a bad clock, and anything nested', () => {
    const many = Object.fromEntries(
      Array.from({ length: 13 }, (_, i) => [`S${i}`, { start: '08:00' }]),
    );
    expect(isPeriodTimes(many)).toBe(false);
    expect(isPeriodTimes({ ['X'.repeat(33)]: { start: '08:00' } })).toBe(false);
    expect(isPeriodTimes({ AM: { start: '8:00' } })).toBe(false);
    expect(isPeriodTimes({ AM: { start: '08:00', extra: 1 } })).toBe(false);
    expect(isPeriodTimes({ AM: { start: { deep: true } } })).toBe(false);
    expect(isPeriodTimes({ AM: ['08:00'] })).toBe(false);
    expect(isPeriodTimes(['08:00'])).toBe(false);
  });

  it('is applied by the DTO, and expectedUpdatedAt must be an ISO instant', () => {
    const body = (period: any, extra: any = {}) =>
      validateSync(
        plainToInstance(PutSchoolTimetableDto, {
          branchId: 115,
          periods: [period],
          slots: [],
          ...extra,
        }),
      );
    expect(
      body({ code: 'P1', times: { '*': { start: '08:00', end: '08:40' } } }),
    ).toHaveLength(0);
    expect(
      body({ code: 'P1', times: { '*': { start: '25:00' } } }).length,
    ).toBeGreaterThan(0);
    expect(
      body({ code: 'P1' }, { expectedUpdatedAt: 'yesterday' }).length,
    ).toBeGreaterThan(0);
  });
});

describe('SchoolTimetableService.mine', () => {
  const existing = {
    id: 9,
    branchId: 115,
    title: 'Week',
    periods: [{ code: 'P1' }],
    shifts: [],
    slots: [
      {
        day: 1,
        period: 'P1',
        classCode: '3aad',
        subject: 'Amharic',
        teacherName: 'T',
        employeeId: 5,
        room: null,
      },
      {
        day: 1,
        period: 'P1',
        classCode: '1aad',
        subject: 'Maths',
        teacherName: 'I',
        employeeId: 8,
        room: null,
      },
    ],
    createdAt: stamp,
    updatedAt: stamp,
  };

  it('returns the caller’s own slots, joined through their employment row', async () => {
    const { svc } = makeService({
      existing,
      employees: [
        {
          id: 5,
          fullName: 'Temesgen Eshetu',
          jobTitle: 'Teacher',
          status: 'ACTIVE',
          userId: 2371,
        },
        { id: 8, fullName: 'Ibrahim Ahmad', status: 'ACTIVE', userId: 2372 },
      ],
    });
    const mine = await svc.mine(115, 2371);
    expect(mine.employee).toEqual({
      id: 5,
      fullName: 'Temesgen Eshetu',
      jobTitle: 'Teacher',
    });
    expect(mine.slots.map((s) => s.classCode)).toEqual(['3aad']);
    expect(mine.periods).toHaveLength(1);
  });

  it('prefers the active row when a login is joined to two, and answers empty for a stranger', async () => {
    const { svc } = makeService({
      existing,
      employees: [
        { id: 40, fullName: 'Old row', status: 'INACTIVE', userId: 2371 },
        {
          id: 5,
          fullName: 'Temesgen Eshetu',
          jobTitle: 'Teacher',
          status: 'ACTIVE',
          userId: 2371,
        },
      ],
    });
    expect((await svc.mine(115, 2371)).employee?.id).toBe(5);
    expect(await svc.mine(115, 999)).toMatchObject({
      employee: null,
      slots: [],
    });
    expect(await svc.mine(115, null)).toMatchObject({
      employee: null,
      slots: [],
    });
  });
});

describe('normalizePersonName', () => {
  it('folds case, punctuation and accents', () => {
    expect(normalizePersonName('Sheekh C/raxmaan  Muxumed Caydiid')).toBe(
      'sheekh c raxmaan muxumed caydiid',
    );
    expect(normalizePersonName('Temesgén Eshetu')).toBe('temesgen eshetu');
    expect(normalizePersonName(null)).toBe('');
  });
});
