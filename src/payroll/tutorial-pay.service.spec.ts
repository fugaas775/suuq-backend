import { BadRequestException } from '@nestjs/common';
import { TutorialPayService } from './tutorial-pay.service';
import { PayrollRun, PayrollRunKind } from './entities/payroll-run.entity';
import { BranchEmployee } from './entities/branch-employee.entity';
import { LessonAttendanceMark } from '../attendance/entities/lesson-attendance-mark.entity';
import { SchoolTimetable } from '../school/entities/school-timetable.entity';

/**
 * Tutorial pay: the rate is on the bell, the lessons are in the register, a
 * lesson is paid when marked taught, and never twice.
 */

const TIMETABLE = {
  branchId: 115,
  periods: [
    { code: 'P1', kind: 'LESSON', days: [1, 2, 3, 4, 5], times: {} },
    {
      code: 'T1',
      label: 'Tutorial',
      kind: 'LESSON',
      days: [1, 2, 3, 4, 5],
      classCodes: ['6aad', '8th'],
      payPerPeriod: 300,
      times: { PM: { start: '19:00', end: '20:00' } },
    },
    {
      code: 'T2',
      label: 'Tutorial',
      kind: 'LESSON',
      days: [1, 2, 3, 4, 5],
      classCodes: ['6aad', '8th'],
      payPerPeriod: 300,
      times: { PM: { start: '20:00', end: '21:00' } },
    },
  ],
  slots: [
    // Monday 2026-10-12: Waciid T1 in 6aad, T2 in 8th; Ahmed T2 in 6aad.
    {
      day: 1,
      period: 'T1',
      classCode: '6aad',
      subject: 'English',
      employeeId: 6,
      teacherName: 'Waciid Cali',
    },
    {
      day: 1,
      period: 'T2',
      classCode: '8th',
      subject: 'English',
      employeeId: 6,
      teacherName: 'Waciid Cali',
    },
    {
      day: 1,
      period: 'T2',
      classCode: '6aad',
      subject: 'Soomaali',
      employeeId: 11,
      teacherName: 'Ahmed Idris',
    },
    // An ordinary daytime lesson — covered by salary, never tutorial pay.
    {
      day: 1,
      period: 'P1',
      classCode: '6aad',
      subject: 'English',
      employeeId: 6,
      teacherName: 'Waciid Cali',
    },
  ],
};

const STAFF = [
  { id: 6, fullName: 'Waciid Cali', jobTitle: 'Teacher', currency: 'ETB' },
  { id: 11, fullName: 'Ahmed Idris', jobTitle: 'Teacher', currency: 'ETB' },
];

function mark(
  subjectRef: number,
  periodCode: string,
  classCode: string,
  status: string,
  attendanceDate = '2026-10-12',
) {
  return {
    branchId: 115,
    subjectType: 'STAFF',
    subjectRef: String(subjectRef),
    subjectName: null,
    attendanceDate,
    periodCode,
    classCode,
    subject: 'English',
    status,
  };
}

function makeService({
  marks = [] as any[],
  timetable = TIMETABLE as any,
  earlierRuns = [] as any[],
} = {}) {
  const saved: any[] = [];
  const queries: any[] = [];
  const runs: any[] = [...earlierRuns];
  const runRepo: any = {
    find: async () => runs.filter((r) => r.kind === PayrollRunKind.TUTORIAL),
    create: (row: any) => ({ ...row }),
    save: async (row: any) => {
      const out = {
        id: row.id ?? 900 + saved.length,
        createdAt: new Date(),
        ...row,
      };
      saved.push(out);
      if (!runs.includes(row)) runs.push(out);
      return out;
    },
    delete: jest.fn(async () => undefined),
  };
  const em: any = {
    query: async (...args: any[]) => queries.push(args),
    getRepository: (entity: any) => {
      if (entity === SchoolTimetable) return { findOne: async () => timetable };
      if (entity === BranchEmployee) return { find: async () => STAFF };
      if (entity === LessonAttendanceMark) return { find: async () => marks };
      if (entity === PayrollRun) return runRepo;
      throw new Error('unexpected repository');
    },
  };
  runRepo.manager = { ...em, transaction: async (fn: any) => fn(em) };
  const billing: any = {
    createBranchExpense: jest.fn(async () => ({ id: 555 })),
  };
  const payroll: any = {
    toRun: (r: any) => ({
      id: r.id,
      kind: r.kind,
      total: r.total,
      lines: r.lines,
    }),
  };
  const svc = new TutorialPayService(runRepo, payroll, billing);
  return { svc, saved, billing, queries, runRepo };
}

describe('TutorialPayService', () => {
  it('pays each tutorial lesson marked PRESENT or LATE at the period’s rate, and names the unmarked', async () => {
    const { svc } = makeService({
      marks: [
        mark(6, 'T1', '6aad', 'PRESENT'),
        mark(6, 'T2', '8th', 'LATE'),
        mark(6, 'P1', '6aad', 'PRESENT'), // daytime — not tutorial pay
      ],
    });
    const out = await svc.preview({
      branchId: 115,
      from: '2026-10-11',
      to: '2026-10-17',
      asOf: '2026-10-17',
    });
    expect(out.paidPeriods.map((p) => p.code)).toEqual(['T1', 'T2']);
    const waciid = out.teachers.find((t) => t.employeeId === 6);
    expect(waciid).toMatchObject({
      taught: 2,
      payable: 2,
      amount: 600,
      unmarked: 0,
      scheduled: 2,
    });
    const ahmed = out.teachers.find((t) => t.employeeId === 11);
    expect(ahmed).toMatchObject({
      taught: 0,
      payable: 0,
      amount: 0,
      unmarked: 1,
    });
    expect(ahmed.unmarkedLessons).toEqual([
      {
        date: '2026-10-12',
        period: 'T2',
        classCode: '6aad',
        subject: 'Soomaali',
      },
    ]);
    expect(out.totals).toMatchObject({ payable: 2, amount: 600, unmarked: 1 });
  });

  it('does not pay an absence, and does not call a lesson after today unmarked', async () => {
    const { svc } = makeService({ marks: [mark(6, 'T1', '6aad', 'ABSENT')] });
    const out = await svc.preview({
      branchId: 115,
      from: '2026-10-11',
      to: '2026-10-17',
      asOf: '2026-10-11', // the Sunday before Monday's lessons
    });
    const waciid = out.teachers.find((t) => t.employeeId === 6);
    expect(waciid).toMatchObject({
      absent: 1,
      taught: 0,
      amount: 0,
      unmarked: 0,
    });
  });

  it('answers empty when no period carries a rate', async () => {
    const { svc } = makeService({
      timetable: { ...TIMETABLE, periods: [TIMETABLE.periods[0]] },
      marks: [mark(6, 'T1', '6aad', 'PRESENT')],
    });
    const out = await svc.preview({
      branchId: 115,
      from: '2026-10-11',
      to: '2026-10-17',
    });
    expect(out.paidPeriods).toEqual([]);
    expect(out.teachers).toEqual([]);
  });

  it('posts one TUTORIAL run and one PAYROLL expense, freezing every lesson it paid', async () => {
    const { svc, saved, billing, queries } = makeService({
      marks: [
        mark(6, 'T1', '6aad', 'PRESENT'),
        mark(11, 'T2', '6aad', 'PRESENT'),
      ],
    });
    const run: any = await svc.createRun(115, 7, {
      branchId: 115,
      periodKey: '2026-10',
      from: '2026-10-11',
      to: '2026-11-09',
      label: 'Tutorial — Tikimt 2019 E.C.',
    });
    expect(queries[0][1]).toEqual([812640, 115]);
    expect(run.kind).toBe(PayrollRunKind.TUTORIAL);
    expect(run.total).toBe(600);
    expect(run.lessons).toBe(2);
    expect(saved[0].lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeId: 6,
          amount: 300,
          lessons: [
            {
              date: '2026-10-12',
              period: 'T1',
              classCode: '6aad',
              subject: 'English',
              rate: 300,
            },
          ],
        }),
        expect.objectContaining({ employeeId: 11, amount: 300 }),
      ]),
    );
    expect(billing.createBranchExpense).toHaveBeenCalledWith(
      115,
      7,
      expect.objectContaining({
        category: 'PAYROLL',
        amount: 600,
        note: expect.stringContaining('2 teachers, 2 periods'),
      }),
    );
  });

  it('never pays a lesson twice — a second run pays only what was marked since', async () => {
    const earlier = {
      id: 1,
      kind: PayrollRunKind.TUTORIAL,
      lines: [
        {
          employeeId: 6,
          lessons: [
            { date: '2026-10-12', period: 'T1', classCode: '6aad', rate: 300 },
          ],
        },
      ],
    };
    const { svc } = makeService({
      earlierRuns: [earlier],
      marks: [
        mark(6, 'T1', '6aad', 'PRESENT'),
        mark(6, 'T2', '8th', 'PRESENT'),
      ],
    });
    const out = await svc.preview({
      branchId: 115,
      from: '2026-10-11',
      to: '2026-10-17',
    });
    expect(out.teachers.find((t) => t.employeeId === 6)).toMatchObject({
      taught: 2,
      alreadyPaid: 1,
      payable: 1,
      amount: 300,
    });

    const { svc: again } = makeService({
      earlierRuns: [
        {
          ...earlier,
          lines: [
            {
              employeeId: 6,
              lessons: [
                {
                  date: '2026-10-12',
                  period: 'T1',
                  classCode: '6aad',
                  rate: 300,
                },
                {
                  date: '2026-10-12',
                  period: 'T2',
                  classCode: '8th',
                  rate: 300,
                },
              ],
            },
          ],
        },
      ],
      marks: [
        mark(6, 'T1', '6aad', 'PRESENT'),
        mark(6, 'T2', '8th', 'PRESENT'),
      ],
    });
    await expect(
      again.createRun(115, 7, {
        branchId: 115,
        periodKey: '2026-10',
        from: '2026-10-11',
        to: '2026-10-17',
      }),
    ).rejects.toThrow('already been paid');
  });

  it('refuses a run with nothing marked, a span past two months, and deletes the run if the expense fails', async () => {
    const { svc } = makeService();
    await expect(
      svc.createRun(115, 7, {
        branchId: 115,
        periodKey: '2026-10',
        from: '2026-10-11',
        to: '2026-10-17',
      }),
    ).rejects.toThrow('marked taught yet');
    await expect(
      svc.preview({ branchId: 115, from: '2026-01-01', to: '2026-06-01' }),
    ).rejects.toThrow(BadRequestException);

    const failing = makeService({ marks: [mark(6, 'T1', '6aad', 'PRESENT')] });
    failing.billing.createBranchExpense.mockRejectedValueOnce(
      new Error('ledger down'),
    );
    await expect(
      failing.svc.createRun(115, 7, {
        branchId: 115,
        periodKey: '2026-10',
        from: '2026-10-11',
        to: '2026-10-17',
      }),
    ).rejects.toThrow('ledger down');
    expect(failing.runRepo.delete).toHaveBeenCalled();
  });
});
