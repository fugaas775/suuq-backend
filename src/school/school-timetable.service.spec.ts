import { BadRequestException } from '@nestjs/common';
import {
  SchoolTimetableService,
  normalizePersonName,
} from './school-timetable.service';

/**
 * The timetable's rules: class codes come from the registry, a teacher is in
 * one room at a time, a class has one lesson per period, and a bare name links
 * to exactly one employee or to nobody.
 */

const stamp = new Date('2026-09-16T08:00:00.000Z');

function makeService({
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
  const repo: any = {
    findOne: async () => existing,
    create: (partial: any) => ({ ...partial }),
    save: async (row: any) => {
      saved.push(row);
      return { id: 1, createdAt: stamp, updatedAt: stamp, ...row };
    },
  };
  const classes: any = { find: async () => registry };
  const staff: any = { find: async () => employees };
  const svc = new SchoolTimetableService(repo, classes, staff);
  return { svc, saved };
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

describe('normalizePersonName', () => {
  it('folds case, punctuation and accents', () => {
    expect(normalizePersonName('Sheekh C/raxmaan  Muxumed Caydiid')).toBe(
      'sheekh c raxmaan muxumed caydiid',
    );
    expect(normalizePersonName('Temesgén Eshetu')).toBe('temesgen eshetu');
    expect(normalizePersonName(null)).toBe('');
  });
});
