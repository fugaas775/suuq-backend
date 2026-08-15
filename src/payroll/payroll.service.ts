import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchBillingService } from '../billing/branch-billing.service';
import { BranchExpenseCategory } from '../billing/entities/branch-expense.entity';
import {
  BranchEmployee,
  BranchEmployeeStatus,
} from './entities/branch-employee.entity';
import { PayrollRun, PayrollRunLine } from './entities/payroll-run.entity';
import {
  CreateBranchEmployeeDto,
  CreatePayrollRunDto,
  ListBranchEmployeesQueryDto,
  ListPayrollRunsQueryDto,
  UpdateBranchEmployeeDto,
} from './dto/payroll.dto';

/** Postgres unique-violation, however the driver wrapped it. */
function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return String(code) === '23505';
}

function money(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * The branch's people and what they cost.
 *
 * Two rules carry the weight here:
 *
 *   1. A run SNAPSHOTS its lines. See {@link PayrollRun}.
 *   2. Someone with no salary on file is skipped and NAMED in the response.
 *      Silently paying 21 of 22 people and reporting a total is how a missing
 *      wage becomes invisible; the caller gets `skipped` and the UI shows it.
 */
@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(BranchEmployee)
    private readonly employees: Repository<BranchEmployee>,
    @InjectRepository(PayrollRun)
    private readonly runs: Repository<PayrollRun>,
    private readonly billing: BranchBillingService,
  ) {}

  private toEmployee(row: BranchEmployee) {
    return {
      id: Number(row.id),
      branchId: row.branchId,
      fullName: row.fullName,
      jobTitle: row.jobTitle ?? null,
      monthlySalary:
        row.monthlySalary == null ? null : Number(row.monthlySalary),
      currency: row.currency,
      status: row.status,
      userId: row.userId ?? null,
      startedAt: row.startedAt ?? null,
      endedAt: row.endedAt ?? null,
      note: row.note ?? null,
      metadata: row.metadata ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toRun(row: PayrollRun) {
    return {
      id: Number(row.id),
      branchId: row.branchId,
      periodKey: row.periodKey,
      label: row.label ?? null,
      total: Number(row.total),
      currency: row.currency,
      headcount: row.headcount ?? 0,
      lines: Array.isArray(row.lines) ? row.lines : [],
      expenseId: row.expenseId ?? null,
      occurredAt: row.occurredAt.toISOString(),
      postedByUserId: row.postedByUserId ?? null,
      note: row.note ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------- employees

  async listEmployees(query: ListBranchEmployeesQueryDto) {
    const qb = this.employees
      .createQueryBuilder('e')
      .where('e."branchId" = :branchId', { branchId: query.branchId });

    const status = String(query.status || '')
      .trim()
      .toUpperCase();
    if (
      status &&
      Object.values(BranchEmployeeStatus).includes(
        status as BranchEmployeeStatus,
      )
    ) {
      qb.andWhere('e.status = :status', { status });
    }

    const rows = await qb
      .orderBy('e.status', 'ASC')
      .addOrderBy('e."monthlySalary"', 'DESC', 'NULLS LAST')
      .addOrderBy('e."fullName"', 'ASC')
      .take(1000)
      .getMany();

    const items = rows.map((r) => this.toEmployee(r));
    const active = items.filter(
      (i) => i.status === BranchEmployeeStatus.ACTIVE,
    );
    return {
      items,
      summary: {
        headcount: active.length,
        // The wage bill only counts people whose wage is known. Treating a null
        // as zero would report a payroll that is quietly short by one salary.
        monthlyTotal: money(
          active.reduce((sum, i) => sum + (i.monthlySalary ?? 0), 0),
        ),
        missingSalary: active.filter((i) => i.monthlySalary == null).length,
      },
    };
  }

  /** An ACTIVE employee of this branch with the same name, matched loosely. */
  private async findActiveByName(branchId: number, fullName: string) {
    const wanted = String(fullName || '').trim();
    if (!wanted) return null;
    return this.employees
      .createQueryBuilder('e')
      .where('e."branchId" = :branchId', { branchId })
      .andWhere('e.status = :status', {
        status: BranchEmployeeStatus.ACTIVE,
      })
      .andWhere('LOWER(BTRIM(e."fullName")) = LOWER(BTRIM(:fullName))', {
        fullName: wanted,
      })
      .getOne();
  }

  async createEmployee(dto: CreateBranchEmployeeDto) {
    const fullName = String(dto.fullName || '').trim();
    if (!fullName) throw new BadRequestException('A name is required.');

    if (!dto.allowDuplicateName) {
      const clash = await this.findActiveByName(dto.branchId, fullName);
      if (clash) {
        throw new ConflictException(
          `"${clash.fullName}" is already on this branch's payroll. Send allowDuplicateName if two people really do share the name.`,
        );
      }
    }

    const status = String(dto.status || '')
      .trim()
      .toUpperCase();
    const row = this.employees.create({
      branchId: dto.branchId,
      fullName,
      jobTitle: dto.jobTitle ? String(dto.jobTitle).trim() : null,
      monthlySalary:
        dto.monthlySalary == null ? null : money(Number(dto.monthlySalary)),
      currency: (dto.currency || 'ETB').toUpperCase(),
      status:
        status === BranchEmployeeStatus.INACTIVE
          ? BranchEmployeeStatus.INACTIVE
          : BranchEmployeeStatus.ACTIVE,
      userId: dto.userId ?? null,
      startedAt: dto.startedAt || null,
      endedAt: dto.endedAt || null,
      note: dto.note ? String(dto.note).trim() : null,
    });
    return this.toEmployee(await this.employees.save(row));
  }

  async updateEmployee(id: number, dto: UpdateBranchEmployeeDto) {
    const row = await this.employees.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) {
      throw new NotFoundException('Employee not found for this branch.');
    }

    if (dto.fullName !== undefined) {
      const next = String(dto.fullName).trim();
      if (!next) throw new BadRequestException('A name is required.');
      row.fullName = next;
    }
    if (dto.jobTitle !== undefined) {
      row.jobTitle = dto.jobTitle ? String(dto.jobTitle).trim() : null;
    }
    // Explicit null clears the salary back to unknown, which is different from
    // zero: unknown is skipped by a run, zero is paid as nothing.
    if (dto.monthlySalary !== undefined) {
      row.monthlySalary =
        dto.monthlySalary == null ? null : money(Number(dto.monthlySalary));
    }
    if (dto.currency !== undefined) {
      row.currency = String(dto.currency || 'ETB').toUpperCase();
    }
    if (dto.status !== undefined) {
      const status = String(dto.status).trim().toUpperCase();
      if (
        Object.values(BranchEmployeeStatus).includes(
          status as BranchEmployeeStatus,
        )
      ) {
        row.status = status as BranchEmployeeStatus;
      }
    }
    if (dto.userId !== undefined) row.userId = dto.userId ?? null;
    if (dto.startedAt !== undefined) row.startedAt = dto.startedAt || null;
    if (dto.endedAt !== undefined) row.endedAt = dto.endedAt || null;
    if (dto.note !== undefined) {
      row.note = dto.note ? String(dto.note).trim() : null;
    }

    return this.toEmployee(await this.employees.save(row));
  }

  /**
   * Remove an employee outright — a typo being undone.
   *
   * Safe to allow even after they have been paid: a run stores its own lines, so
   * history keeps their name and amount whether or not the register still holds
   * them. A leaver wants INACTIVE, which keeps them on the roster.
   */
  async removeEmployee(id: number, branchId: number) {
    const row = await this.employees.findOne({ where: { id, branchId } });
    if (!row) {
      throw new NotFoundException('Employee not found for this branch.');
    }
    await this.employees.delete({ id: row.id });
    return { deleted: true, id: Number(row.id), fullName: row.fullName };
  }

  // --------------------------------------------------------------------- runs

  async listRuns(query: ListPayrollRunsQueryDto) {
    const rows = await this.runs.find({
      where: { branchId: query.branchId },
      order: { periodKey: 'DESC' },
      take: 120,
    });
    return { items: rows.map((r) => this.toRun(r)) };
  }

  async createRun(branchId: number, userId: number, dto: CreatePayrollRunDto) {
    const periodKey = String(dto.periodKey || '').trim();
    if (!periodKey) throw new BadRequestException('A period is required.');

    const qb = this.employees
      .createQueryBuilder('e')
      .where('e."branchId" = :branchId', { branchId })
      .andWhere('e.status = :status', { status: BranchEmployeeStatus.ACTIVE });
    if (dto.employeeIds?.length) {
      qb.andWhere('e.id IN (:...ids)', { ids: dto.employeeIds });
    }
    const roster = await qb.orderBy('e."fullName"', 'ASC').getMany();

    if (!roster.length) {
      throw new BadRequestException(
        'Nobody is on this branch’s payroll yet. Add employees before running it.',
      );
    }

    const payable = roster.filter(
      (e) => e.monthlySalary != null && Number(e.monthlySalary) > 0,
    );
    const skipped = roster
      .filter((e) => !payable.includes(e))
      .map((e) => ({
        employeeId: Number(e.id),
        fullName: e.fullName,
        reason:
          e.monthlySalary == null ? 'No salary on file' : 'Salary is zero',
      }));

    if (!payable.length) {
      throw new BadRequestException(
        'No one on the roster has a salary recorded, so there is nothing to pay.',
      );
    }

    const currencies = new Set(payable.map((e) => e.currency || 'ETB'));
    if (currencies.size > 1) {
      throw new BadRequestException(
        `This roster mixes currencies (${[...currencies].join(', ')}). One run posts one expense, so it can only pay one.`,
      );
    }
    const currency = [...currencies][0] || 'ETB';

    const lines: PayrollRunLine[] = payable.map((e) => ({
      employeeId: Number(e.id),
      fullName: e.fullName,
      jobTitle: e.jobTitle ?? null,
      amount: money(Number(e.monthlySalary)),
    }));
    const total = money(lines.reduce((sum, l) => sum + l.amount, 0));
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('That date could not be read.');
    }

    // Claim the period FIRST. The unique index is what actually stops a double
    // post, and saving the run before the expense means a lost race can never
    // strand an unreferenced expense in the books.
    let run: PayrollRun;
    try {
      run = await this.runs.save(
        this.runs.create({
          branchId,
          periodKey,
          label: dto.label ? String(dto.label).trim() : null,
          total,
          currency,
          headcount: lines.length,
          lines,
          expenseId: null,
          occurredAt,
          postedByUserId: userId ?? null,
          note: dto.note ? String(dto.note).trim() : null,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Payroll for ${periodKey} has already been run for this branch. Delete that run first if you need to redo it.`,
        );
      }
      throw error;
    }

    try {
      const expense = await this.billing.createBranchExpense(branchId, userId, {
        category: BranchExpenseCategory.PAYROLL,
        amount: total,
        currency,
        occurredAt,
        note: `Payroll — ${dto.label || periodKey} (${lines.length} staff)`,
      });
      run.expenseId = Number(expense.id);
      run = await this.runs.save(run);
    } catch (error) {
      // Nothing was posted, so the run must not survive to claim the period.
      await this.runs.delete({ id: run.id });
      throw error;
    }

    return { ...this.toRun(run), skipped };
  }

  /**
   * Undo a run, expense and ledger together.
   *
   * `deleteBranchExpense` reverses its own ledger posting, so removing the run
   * without it would leave the P&L carrying a month of wages no document
   * explains.
   */
  async deleteRun(id: number, branchId: number) {
    const run = await this.runs.findOne({ where: { id, branchId } });
    if (!run) throw new NotFoundException('Payroll run not found.');

    if (run.expenseId != null) {
      await this.billing.deleteBranchExpense(branchId, Number(run.expenseId));
    }
    await this.runs.delete({ id: run.id });
    return { deleted: true, id: Number(run.id), periodKey: run.periodKey };
  }
}
