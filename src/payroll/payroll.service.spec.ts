import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { BranchEmployeeStatus } from './entities/branch-employee.entity';

/**
 * Payroll's rules, all of which are about money that is easy to get wrong
 * quietly: a wage that is unknown rather than zero, a month paid twice, and an
 * expense that outlives the document explaining it.
 */

const stamp = new Date('2026-10-10T08:00:00.000Z');

function employee(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    branchId: 115,
    fullName: 'Ahmed Idris',
    jobTitle: 'Teacher',
    monthlySalary: 11000,
    currency: 'ETB',
    status: BranchEmployeeStatus.ACTIVE,
    userId: null,
    startedAt: null,
    endedAt: null,
    note: null,
    metadata: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...over,
  } as any;
}

function makeService({
  roster = [] as any[],
  existingByName = null as any,
  runRows = [] as any[],
  expenseThrows = false,
  runSaveThrows = false,
} = {}) {
  const savedRuns: any[] = [];
  const deletedRuns: any[] = [];
  const expenses: any[] = [];
  const deletedExpenses: any[] = [];

  const employeeQb: any = {
    where: () => employeeQb,
    andWhere: () => employeeQb,
    orderBy: () => employeeQb,
    addOrderBy: () => employeeQb,
    take: () => employeeQb,
    getOne: async () => existingByName,
    getMany: async () => roster,
  };

  const employees: any = {
    createQueryBuilder: () => employeeQb,
    findOne: async ({ where }: any) =>
      roster.find(
        (r: any) =>
          Number(r.id) === Number(where.id) && r.branchId === where.branchId,
      ) ?? null,
    create: (value: any) => ({ ...value }),
    save: async (value: any) => {
      value.id = value.id ?? 91;
      value.createdAt = value.createdAt ?? stamp;
      value.updatedAt = stamp;
      return value;
    },
    delete: async () => ({ affected: 1 }),
  };

  const runs: any = {
    find: async () => runRows,
    findOne: async ({ where }: any) =>
      runRows.find(
        (r: any) =>
          Number(r.id) === Number(where.id) && r.branchId === where.branchId,
      ) ?? null,
    create: (value: any) => ({ ...value }),
    save: async (value: any) => {
      if (runSaveThrows && !value.id) {
        // Exactly what the driver raises when the unique index rejects a
        // second run for the same (branchId, periodKey).
        const err: any = new Error('duplicate key value');
        err.code = '23505';
        throw err;
      }
      value.id = value.id ?? 55;
      value.createdAt = value.createdAt ?? stamp;
      value.updatedAt = stamp;
      savedRuns.push({ ...value });
      return value;
    },
    delete: async (criteria: any) => {
      deletedRuns.push(criteria);
      return { affected: 1 };
    },
  };

  const billing: any = {
    createBranchExpense: async (branchId: number, userId: number, dto: any) => {
      if (expenseThrows) throw new Error('ledger unavailable');
      const row = { id: 700 + expenses.length, branchId, userId, ...dto };
      expenses.push(row);
      return row;
    },
    voidBranchExpenseForRun: async (
      branchId: number,
      expenseId: number,
      reason: string,
    ) => {
      deletedExpenses.push({ branchId, expenseId, reason });
    },
  };

  return {
    service: new PayrollService(employees, runs, billing),
    savedRuns,
    deletedRuns,
    expenses,
    deletedExpenses,
  };
}

describe('PayrollService — the roster', () => {
  it('counts a missing salary as unknown, not as zero', async () => {
    // The wage bill must not quietly absorb someone whose pay nobody recorded.
    // Treating null as 0 reports a plausible total that is short by one salary.
    const { service } = makeService({
      roster: [
        employee({ id: 1, fullName: 'Ahmed Idris', monthlySalary: 11000 }),
        employee({
          id: 2,
          fullName: 'Cali Maxamed yaasiin',
          jobTitle: 'Camera man',
          monthlySalary: null,
        }),
      ],
    });

    const res = await service.listEmployees({ branchId: 115 });
    expect(res.summary.headcount).toBe(2);
    expect(res.summary.monthlyTotal).toBe(11000);
    expect(res.summary.missingSalary).toBe(1);
  });

  it('refuses a name already on the active roster, unless told twice', async () => {
    const { service } = makeService({
      existingByName: employee({ fullName: 'Ahmed Idris' }),
    });

    await expect(
      service.createEmployee({ branchId: 115, fullName: 'ahmed idris  ' }),
    ).rejects.toBeInstanceOf(ConflictException);

    // Two people really can share a name — the flag says so out loud.
    const created = await service.createEmployee({
      branchId: 115,
      fullName: 'Ahmed Idris',
      allowDuplicateName: true,
    });
    expect(created.fullName).toBe('Ahmed Idris');
  });

  it('clears a salary back to unknown on an explicit null', async () => {
    // Distinct from zero: unknown is skipped by a run, zero is paid as nothing.
    const { service } = makeService({
      roster: [employee({ id: 1, monthlySalary: 11000 })],
    });
    const updated = await service.updateEmployee(1, {
      branchId: 115,
      monthlySalary: null,
    });
    expect(updated.monthlySalary).toBeNull();
  });

  it('404s an employee belonging to another branch', async () => {
    const { service } = makeService({ roster: [employee({ id: 1 })] });
    await expect(
      service.updateEmployee(1, { branchId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PayrollService — running a month', () => {
  const ROSTER = [
    employee({
      id: 1,
      fullName: 'Dr. Aron Alemayehu',
      jobTitle: 'General Director',
      monthlySalary: 40000,
    }),
    employee({
      id: 2,
      fullName: 'Ahmed Idris',
      jobTitle: 'Teacher',
      monthlySalary: 11000,
    }),
    employee({
      id: 3,
      fullName: 'Cali Maxamed yaasiin',
      jobTitle: 'Camera man',
      monthlySalary: null,
    }),
  ];

  it('pays those it can, names those it cannot, and posts one expense', async () => {
    const { service, expenses } = makeService({ roster: ROSTER });

    const run = await service.createRun(115, 42, {
      branchId: 115,
      periodKey: '2026-09',
      label: 'Meskerem 2019 E.C.',
    });

    expect(run.total).toBe(51000);
    expect(run.headcount).toBe(2);
    // The person with no salary is REPORTED, not dropped in silence.
    expect(run.skipped).toEqual([
      {
        employeeId: 3,
        fullName: 'Cali Maxamed yaasiin',
        reason: 'No salary on file',
      },
    ]);

    // One expense, of the category the P&L classifies as labour.
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({
      category: 'PAYROLL',
      amount: 51000,
      currency: 'ETB',
    });
    expect(run.expenseId).toBe(700);
  });

  it('freezes what it paid, so a later raise cannot restate it', async () => {
    const roster = [
      employee({ id: 2, fullName: 'Ahmed Idris', monthlySalary: 11000 }),
    ];
    const { service } = makeService({ roster });

    const run = await service.createRun(115, 42, {
      branchId: 115,
      periodKey: '2026-09',
    });

    // The raise lands on the register afterwards…
    roster[0].monthlySalary = 15000;

    // …and the posted month is unmoved, because it stored its own lines.
    expect(run.lines).toEqual([
      {
        employeeId: 2,
        fullName: 'Ahmed Idris',
        jobTitle: 'Teacher',
        amount: 11000,
      },
    ]);
    expect(run.total).toBe(11000);
  });

  it('refuses a second run for a period the index already holds', async () => {
    const { service } = makeService({ roster: ROSTER, runSaveThrows: true });
    await expect(
      service.createRun(115, 42, { branchId: 115, periodKey: '2026-09' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('leaves no run behind when the expense fails to post', async () => {
    // The run claims the period before the money moves. If posting then fails,
    // a surviving run would block the month forever with nothing in the books.
    const { service, deletedRuns, expenses } = makeService({
      roster: ROSTER,
      expenseThrows: true,
    });

    await expect(
      service.createRun(115, 42, { branchId: 115, periodKey: '2026-09' }),
    ).rejects.toThrow('ledger unavailable');

    expect(expenses).toHaveLength(0);
    expect(deletedRuns).toEqual([{ id: 55 }]);
  });

  it('will not pay a roster that mixes currencies', async () => {
    const { service } = makeService({
      roster: [
        employee({ id: 1, monthlySalary: 11000, currency: 'ETB' }),
        employee({
          id: 2,
          fullName: 'Someone Else',
          monthlySalary: 900,
          currency: 'USD',
        }),
      ],
    });
    await expect(
      service.createRun(115, 42, { branchId: 115, periodKey: '2026-09' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not run an empty or unpriced roster', async () => {
    const { service: noOne } = makeService({ roster: [] });
    await expect(
      noOne.createRun(115, 42, { branchId: 115, periodKey: '2026-09' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const { service: noPay } = makeService({
      roster: [employee({ monthlySalary: null })],
    });
    await expect(
      noPay.createRun(115, 42, { branchId: 115, periodKey: '2026-09' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('takes the expense with it when a run is deleted', async () => {
    // Otherwise the P&L keeps a month of wages that no document explains.
    const { service, deletedExpenses, deletedRuns } = makeService({
      runRows: [
        { id: 55, branchId: 115, periodKey: '2026-09', expenseId: 700 },
      ],
    });

    const res = await service.deleteRun(55, 115);
    expect(res).toEqual({ deleted: true, id: 55, periodKey: '2026-09' });
    // The run is gone; the voided expense row is the only surviving record
    // that this month was ever posted, so it has to say why it went.
    expect(deletedExpenses).toEqual([
      {
        branchId: 115,
        expenseId: 700,
        reason: 'Payroll run 2026-09 was deleted.',
      },
    ]);
    expect(deletedRuns).toEqual([{ id: 55 }]);
  });
});
