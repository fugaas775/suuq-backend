import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { BranchEmployee } from '../payroll/entities/branch-employee.entity';
import {
  SchoolStaffWarning,
  StaffWarningLevel,
} from './entities/school-staff-warning.entity';
import {
  AcknowledgeSchoolStaffWarningDto,
  IssueSchoolStaffWarningDto,
  ListSchoolStaffWarningsQueryDto,
  WithdrawSchoolStaffWarningDto,
} from './dto/school-staff-warning.dto';
import { ScopeActor } from './school-class-scope.service';
import { isStaffHead } from './school-leave.policy';
import {
  defaultExpiry,
  summarizeWarnings,
} from './school-staff-warning.policy';

const text = (v: unknown) => String(v ?? '').trim();
const orNull = (v: unknown, max: number) => text(v).slice(0, max) || null;
const today = () => new Date().toISOString().slice(0, 10);

type Who = {
  actorId: number | null;
  employee: BranchEmployee | null;
  head: boolean;
  name: string;
};

/**
 * Formal warnings — the steps a school records before anyone is dismissed.
 *
 * The heads (the same people who decide leave) issue and withdraw; the
 * person reads their own and acknowledges. Nobody warns themselves. A
 * warning is never deleted: withdrawn stays on file as withdrawn.
 */
@Injectable()
export class SchoolStaffWarningService {
  constructor(
    @InjectRepository(SchoolStaffWarning)
    private readonly warnings: Repository<SchoolStaffWarning>,
    @InjectRepository(Branch)
    private readonly branches: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly assignments: Repository<BranchStaffAssignment>,
    @InjectRepository(BranchEmployee)
    private readonly employees: Repository<BranchEmployee>,
  ) {}

  /** Same resolution as leave: the actor's staff row, and whether they are a head. */
  private async whoIs(
    branchId: number,
    actor: ScopeActor | null | undefined,
  ): Promise<Who> {
    const actorId = actor?.id ?? null;
    const [branch, assignment, rows] = await Promise.all([
      this.branches.findOne({
        where: { id: branchId },
        select: { id: true, ownerId: true },
      }),
      actorId != null
        ? this.assignments.findOne({ where: { branchId, userId: actorId } })
        : Promise.resolve(null),
      actorId != null
        ? this.employees.find({ where: { branchId, userId: actorId } })
        : Promise.resolve([] as BranchEmployee[]),
    ]);
    const employee =
      rows.find((r) => String(r.status).toUpperCase() !== 'INACTIVE') ??
      rows[0] ??
      null;
    const ownerId = (branch as { ownerId?: number } | null)?.ownerId ?? null;
    const head = isStaffHead({
      actorId,
      ownerId,
      roles: actor?.roles ?? null,
      assignment,
      employee,
    });
    const name =
      employee?.fullName ||
      text(actor?.email) ||
      (actorId != null ? `user ${actorId}` : '');
    return { actorId, employee, head, name };
  }

  private refuseNotHead(): never {
    throw new ForbiddenException({
      code: 'SCHOOL_WARNING_NOT_HEAD',
      message:
        'Only the Director, the Deputy Director, a manager or the owner gives or reads staff warnings.',
    });
  }

  async list(query: ListSchoolStaffWarningsQueryDto, actor: ScopeActor) {
    const who = await this.whoIs(query.branchId, actor);
    const where: FindOptionsWhere<SchoolStaffWarning> = {
      branchId: query.branchId,
    };
    if (text(query.status))
      where.status = text(query.status).toUpperCase() as 'ACTIVE' | 'WITHDRAWN';
    if (String(query.mine ?? '') === '1') {
      if (!who.employee) return { employee: null, canIssue: who.head, items: [] };
      where.employeeId = Number(who.employee.id);
      const items = await this.warnings.find({
        where,
        order: { issuedOn: 'DESC', id: 'DESC' },
        take: 100,
      });
      return {
        employee: { id: Number(who.employee.id), fullName: who.employee.fullName },
        canIssue: who.head,
        items,
      };
    }
    if (!who.head) this.refuseNotHead();
    if (query.employeeId != null) where.employeeId = Number(query.employeeId);
    const items = await this.warnings.find({
      where,
      order: { issuedOn: 'DESC', id: 'DESC' },
      take: 500,
    });
    return {
      employee: who.employee
        ? { id: Number(who.employee.id), fullName: who.employee.fullName }
        : null,
      canIssue: true,
      items,
    };
  }

  /** Give a warning. Heads only, never to oneself, to a person on the staff list. */
  async issue(dto: IssueSchoolStaffWarningDto, actor: ScopeActor) {
    const who = await this.whoIs(dto.branchId, actor);
    if (!who.head) this.refuseNotHead();
    const target = await this.employees.findOne({
      where: { id: Number(dto.employeeId), branchId: dto.branchId },
    });
    if (!target) {
      throw new NotFoundException(
        `No person #${dto.employeeId} on this branch's staff list.`,
      );
    }
    if (who.employee && Number(who.employee.id) === Number(target.id)) {
      throw new ForbiddenException({
        code: 'SCHOOL_WARNING_OWN',
        message: 'A warning to yourself is given by somebody else.',
      });
    }
    const level = String(dto.level).toUpperCase() as StaffWarningLevel;
    const issuedOn = text(dto.issuedOn) || today();
    const expiresOn =
      dto.expiresOn === undefined
        ? defaultExpiry(level, issuedOn)
        : text(dto.expiresOn) || null;
    if (expiresOn && expiresOn < issuedOn) {
      throw new ConflictException({
        code: 'SCHOOL_WARNING_EXPIRY',
        message: 'A warning cannot lapse before the day it is given.',
      });
    }
    const row = this.warnings.create({
      branchId: dto.branchId,
      employeeId: Number(target.id),
      employeeName: target.fullName ?? null,
      level,
      category: String(dto.category).toUpperCase(),
      reason: text(dto.reason).slice(0, 2000),
      expectation: orNull(dto.expectation, 1000),
      issuedOn,
      expiresOn,
      issuedByUserId: who.actorId,
      issuedByName: who.name || null,
      acknowledgedAt: null,
      acknowledgedByUserId: null,
      status: 'ACTIVE',
      withdrawnAt: null,
      withdrawnByUserId: null,
      withdrawnByName: null,
      withdrawNote: null,
    });
    return this.warnings.save(row);
  }

  private async load(id: number, branchId: number) {
    const row = await this.warnings.findOne({ where: { id, branchId } });
    if (!row) throw new NotFoundException(`Warning ${id} not found.`);
    return row;
  }

  /** Take a warning back. It stays on file as withdrawn. */
  async withdraw(
    id: number,
    dto: WithdrawSchoolStaffWarningDto,
    actor: ScopeActor,
  ) {
    const row = await this.load(id, dto.branchId);
    const who = await this.whoIs(dto.branchId, actor);
    if (!who.head) this.refuseNotHead();
    if (row.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'SCHOOL_WARNING_WITHDRAWN',
        message: 'This warning is already withdrawn.',
      });
    }
    row.status = 'WITHDRAWN';
    row.withdrawnAt = new Date();
    row.withdrawnByUserId = who.actorId;
    row.withdrawnByName = who.name || null;
    row.withdrawNote = orNull(dto.note, 400);
    return this.warnings.save(row);
  }

  /** The person's own acknowledgement — that they have read it, not that they agree. */
  async acknowledge(
    id: number,
    dto: AcknowledgeSchoolStaffWarningDto,
    actor: ScopeActor,
  ) {
    const row = await this.load(id, dto.branchId);
    const who = await this.whoIs(dto.branchId, actor);
    if (!who.employee || Number(who.employee.id) !== Number(row.employeeId)) {
      throw new ForbiddenException({
        code: 'SCHOOL_WARNING_NOT_YOURS',
        message: 'Only the person the warning is to acknowledges it.',
      });
    }
    if (row.acknowledgedAt) return row;
    row.acknowledgedAt = new Date();
    row.acknowledgedByUserId = who.actorId;
    return this.warnings.save(row);
  }

  /** Per person: what stands, the highest level, the next step. Heads only. */
  async summary(branchId: number, actor: ScopeActor) {
    const who = await this.whoIs(branchId, actor);
    if (!who.head) this.refuseNotHead();
    const rows = await this.warnings.find({ where: { branchId } });
    return { today: today(), people: summarizeWarnings(rows, today()) };
  }
}
