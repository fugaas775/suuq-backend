import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { BranchEmployee } from '../payroll/entities/branch-employee.entity';
import {
  LeaveStatus,
  SchoolLeaveRequest,
} from './entities/school-leave-request.entity';
import {
  CancelSchoolLeaveDto,
  CreateSchoolLeaveDto,
  DecideSchoolLeaveDto,
  ListSchoolLeaveQueryDto,
} from './dto/school-leave.dto';
import { SchoolTimetableService } from './school-timetable.service';
import { ScopeActor } from './school-class-scope.service';
import {
  LEAVE_MAX_CALENDAR_DAYS,
  LIVE_LEAVE_STATUSES,
  bellWeekdays,
  calendarDaysBetween,
  isLeaveApprover,
  schoolDaysBetween,
} from './school-leave.policy';

const text = (v: unknown) => String(v ?? '').trim();
const orNull = (v: unknown, max: number) => text(v).slice(0, max) || null;
const today = () => new Date().toISOString().slice(0, 10);

export type LeaveSummaryRow = {
  employeeId: number;
  employeeName: string | null;
  approvedDays: number;
  approved: number;
  pending: number;
  byType: Record<string, number>;
};

type Who = {
  actorId: number | null;
  employee: BranchEmployee | null;
  approver: boolean;
  name: string;
};

/**
 * Staff leave — asked for by the person, decided by the heads.
 *
 * A teacher (any login joined to a staff row) files a request for their
 * own days; the director, the deputy, a manager or the owner approves or
 * rejects it, and can record leave for somebody who phoned in. A request
 * that still stands (pending or approved) blocks another for the same
 * days. Nobody decides their own.
 */
@Injectable()
export class SchoolLeaveService {
  constructor(
    @InjectRepository(SchoolLeaveRequest)
    private readonly leaves: Repository<SchoolLeaveRequest>,
    @InjectRepository(Branch)
    private readonly branches: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly assignments: Repository<BranchStaffAssignment>,
    @InjectRepository(BranchEmployee)
    private readonly employees: Repository<BranchEmployee>,
    private readonly timetable: SchoolTimetableService,
  ) {}

  /** Who the actor is on this branch: their staff row, and whether they decide. */
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
    const approver = isLeaveApprover({
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
    return { actorId, employee, approver, name };
  }

  private refuseNotApprover(): never {
    throw new ForbiddenException({
      code: 'SCHOOL_LEAVE_NOT_APPROVER',
      message:
        'Only the Director, the Deputy Director, a manager or the owner decides leave.',
    });
  }

  async list(query: ListSchoolLeaveQueryDto, actor: ScopeActor) {
    const who = await this.whoIs(query.branchId, actor);
    const where: FindOptionsWhere<SchoolLeaveRequest> = {
      branchId: query.branchId,
    };
    if (text(query.status)) where.status = text(query.status).toUpperCase() as LeaveStatus;
    if (text(query.on)) {
      where.startDate = LessThanOrEqual(query.on as string);
      where.endDate = MoreThanOrEqual(query.on as string);
    } else if (text(query.from) && text(query.to)) {
      where.startDate = LessThanOrEqual(query.to as string);
      where.endDate = MoreThanOrEqual(query.from as string);
    }
    if (String(query.mine ?? '') === '1') {
      if (!who.employee) {
        return { employee: null, canApprove: who.approver, items: [] };
      }
      where.employeeId = Number(who.employee.id);
      const items = await this.leaves.find({
        where,
        order: { startDate: 'DESC', id: 'DESC' },
        take: 200,
      });
      return {
        employee: {
          id: Number(who.employee.id),
          fullName: who.employee.fullName,
          jobTitle: who.employee.jobTitle ?? null,
        },
        canApprove: who.approver,
        items,
      };
    }
    if (!who.approver) this.refuseNotApprover();
    if (query.employeeId != null) where.employeeId = Number(query.employeeId);
    const items = await this.leaves.find({
      where,
      order: { startDate: 'DESC', id: 'DESC' },
      take: 500,
    });
    return {
      employee: who.employee
        ? {
            id: Number(who.employee.id),
            fullName: who.employee.fullName,
            jobTitle: who.employee.jobTitle ?? null,
          }
        : null,
      canApprove: true,
      items,
    };
  }

  /**
   * File a request. One's own lands PENDING; one the office files for
   * somebody else lands APPROVED at once — the office recording that a
   * teacher phoned in sick is the decision, not a request to itself.
   */
  async create(dto: CreateSchoolLeaveDto, actor: ScopeActor) {
    const start = text(dto.startDate);
    const end = text(dto.endDate);
    if (end < start) {
      throw new BadRequestException('The last day is before the first.');
    }
    if (calendarDaysBetween(start, end) > LEAVE_MAX_CALENDAR_DAYS) {
      throw new BadRequestException(
        `One request covers at most ${LEAVE_MAX_CALENDAR_DAYS} days.`,
      );
    }
    const who = await this.whoIs(dto.branchId, actor);
    let target: BranchEmployee | null = who.employee;
    const onBehalf =
      dto.employeeId != null &&
      Number(dto.employeeId) !== Number(who.employee?.id ?? NaN);
    if (onBehalf) {
      if (!who.approver) {
        throw new ForbiddenException({
          code: 'SCHOOL_LEAVE_NOT_APPROVER',
          message:
            'Only the Director, the Deputy Director, a manager or the owner records leave for somebody else.',
        });
      }
      target = await this.employees.findOne({
        where: { id: Number(dto.employeeId), branchId: dto.branchId },
      });
      if (!target) {
        throw new NotFoundException(
          `No person #${dto.employeeId} on this branch's staff list.`,
        );
      }
    } else if (!target) {
      throw new ForbiddenException({
        code: 'SCHOOL_LEAVE_NO_STAFF_ROW',
        message:
          'Your login is not linked to a person on the staff list, so there is nobody to request leave for. The office links it in Branch Staff → Teachers & staff.',
      });
    }

    const clash = await this.leaves.findOne({
      where: {
        branchId: dto.branchId,
        employeeId: Number(target.id),
        status: In([...LIVE_LEAVE_STATUSES]),
        startDate: LessThanOrEqual(end),
        endDate: MoreThanOrEqual(start),
      },
      order: { startDate: 'ASC' },
    });
    if (clash) {
      throw new ConflictException({
        code: 'SCHOOL_LEAVE_OVERLAPS',
        message: `${target.fullName} already has ${clash.status === 'APPROVED' ? 'approved' : 'pending'} leave from ${clash.startDate} to ${clash.endDate}. Cancel it first, or pick other days.`,
      });
    }

    const doc = await this.timetable.get(dto.branchId);
    const schoolDays = schoolDaysBetween(start, end, bellWeekdays(doc?.periods));
    if (schoolDays === 0) {
      throw new BadRequestException(
        'No school day falls between these dates — the school is closed on every one of them.',
      );
    }

    const now = new Date();
    const row = this.leaves.create({
      branchId: dto.branchId,
      employeeId: Number(target.id),
      employeeName: target.fullName ?? null,
      requestedByUserId: who.actorId,
      requestedByName: who.name || null,
      leaveType: String(dto.leaveType).toUpperCase(),
      startDate: start,
      endDate: end,
      schoolDays,
      reason: orNull(dto.reason, 1000),
      status: onBehalf ? 'APPROVED' : 'PENDING',
      decidedByUserId: onBehalf ? who.actorId : null,
      decidedByName: onBehalf ? who.name || null : null,
      decidedAt: onBehalf ? now : null,
      decisionNote: onBehalf ? 'Recorded by the office' : null,
      coverNote: null,
      cancelledByUserId: null,
      cancelledByName: null,
      cancelledAt: null,
      cancelNote: null,
    });
    return this.leaves.save(row);
  }

  private async load(id: number, branchId: number) {
    const row = await this.leaves.findOne({ where: { id, branchId } });
    if (!row) throw new NotFoundException(`Leave request ${id} not found.`);
    return row;
  }

  /** Approve or reject. Heads only, pending only, never one's own. */
  async decide(id: number, dto: DecideSchoolLeaveDto, actor: ScopeActor) {
    const row = await this.load(id, dto.branchId);
    const who = await this.whoIs(dto.branchId, actor);
    if (!who.approver) this.refuseNotApprover();
    if (who.employee && Number(who.employee.id) === Number(row.employeeId)) {
      throw new ForbiddenException({
        code: 'SCHOOL_LEAVE_OWN_REQUEST',
        message: 'Your own leave is decided by somebody else.',
      });
    }
    if (row.status !== 'PENDING') {
      throw new ConflictException({
        code: 'SCHOOL_LEAVE_DECIDED',
        message: `This request is already ${row.status.toLowerCase()}.`,
      });
    }
    row.status = String(dto.decision).toUpperCase() as LeaveStatus;
    row.decidedByUserId = who.actorId;
    row.decidedByName = who.name || null;
    row.decidedAt = new Date();
    row.decisionNote = orNull(dto.note, 400);
    row.coverNote = orNull(dto.coverNote, 400);
    return this.leaves.save(row);
  }

  /**
   * Withdraw a request. The person cancels their own while it is pending,
   * or approved and not yet begun; the heads cancel any that still stands.
   */
  async cancel(id: number, dto: CancelSchoolLeaveDto, actor: ScopeActor) {
    const row = await this.load(id, dto.branchId);
    const who = await this.whoIs(dto.branchId, actor);
    const own =
      !!who.employee && Number(who.employee.id) === Number(row.employeeId);
    if (!own && !who.approver) this.refuseNotApprover();
    if (row.status !== 'PENDING' && row.status !== 'APPROVED') {
      throw new ConflictException({
        code: 'SCHOOL_LEAVE_DECIDED',
        message: `This request is already ${row.status.toLowerCase()}.`,
      });
    }
    if (
      own &&
      !who.approver &&
      row.status === 'APPROVED' &&
      row.startDate <= today()
    ) {
      throw new ForbiddenException({
        code: 'SCHOOL_LEAVE_BEGUN',
        message:
          'Leave that has begun is closed by the office, not withdrawn — ask the Director or the Deputy.',
      });
    }
    row.status = 'CANCELLED';
    row.cancelledByUserId = who.actorId;
    row.cancelledByName = who.name || null;
    row.cancelledAt = new Date();
    row.cancelNote = orNull(dto.note, 400);
    return this.leaves.save(row);
  }

  /**
   * Per person, the leave that overlaps a window — the heads' "this school
   * year" board. A request counts whole: its frozen `schoolDays`, even when
   * a day or two fall outside the window.
   */
  async summary(branchId: number, from: string, to: string, actor: ScopeActor) {
    if (!from || !to)
      throw new BadRequestException('from and to are required.');
    const who = await this.whoIs(branchId, actor);
    if (!who.approver) this.refuseNotApprover();
    const rows = await this.leaves.find({
      where: {
        branchId,
        status: In([...LIVE_LEAVE_STATUSES]),
        startDate: LessThanOrEqual(to),
        endDate: MoreThanOrEqual(from),
      },
    });
    const byPerson = new Map<number, LeaveSummaryRow>();
    for (const row of rows) {
      const id = Number(row.employeeId);
      const entry = byPerson.get(id) ?? {
        employeeId: id,
        employeeName: row.employeeName ?? null,
        approvedDays: 0,
        approved: 0,
        pending: 0,
        byType: {},
      };
      if (row.status === 'APPROVED') {
        entry.approved += 1;
        entry.approvedDays += Number(row.schoolDays) || 0;
        entry.byType[row.leaveType] =
          (entry.byType[row.leaveType] ?? 0) + (Number(row.schoolDays) || 0);
      } else {
        entry.pending += 1;
      }
      byPerson.set(id, entry);
    }
    return {
      from,
      to,
      people: [...byPerson.values()].sort((a, b) =>
        String(a.employeeName ?? '').localeCompare(String(b.employeeName ?? '')),
      ),
    };
  }
}
