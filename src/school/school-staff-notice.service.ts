import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { BranchEmployee } from '../payroll/entities/branch-employee.entity';
import { SchoolStaffNotice } from './entities/school-staff-notice.entity';
import {
  ReadSchoolStaffNoticeDto,
  SendSchoolStaffNoticeDto,
  SetSchoolStaffNoticeActiveDto,
} from './dto/school-staff-notice.dto';
import { ScopeActor } from './school-class-scope.service';
import { isStaffHead } from './school-leave.policy';
import { actorNameFromEmail } from './school-actor-name.util';

const text = (v: unknown) => String(v ?? '').trim();

/** How many of the office's messages a person's page carries. */
const MINE_LIMIT = 30;

type Who = {
  actorId: number | null;
  employee: BranchEmployee | null;
  head: boolean;
  name: string;
};

/**
 * Messages from the heads to the staff (owner 2026-11-23: "the manager or
 * director should send messages to teachers … in single or whole").
 *
 * The heads — the same people who decide leave and give warnings — send, to
 * everybody on the staff list or to the people they name, and read who has
 * read what. A person reads the messages that reach them and says so; they
 * never see who else has. Nothing is deleted: a message is taken down.
 */
@Injectable()
export class SchoolStaffNoticeService {
  constructor(
    @InjectRepository(SchoolStaffNotice)
    private readonly notices: Repository<SchoolStaffNotice>,
    @InjectRepository(Branch)
    private readonly branches: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly assignments: Repository<BranchStaffAssignment>,
    @InjectRepository(BranchEmployee)
    private readonly employees: Repository<BranchEmployee>,
  ) {}

  /** Same resolution as warnings: the actor's staff row, and whether a head. */
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
      actorNameFromEmail(actor?.email) ||
      (actorId != null ? `user ${actorId}` : '');
    return { actorId, employee, head, name };
  }

  private refuseNotHead(): never {
    throw new ForbiddenException({
      code: 'SCHOOL_STAFF_NOTICE_NOT_HEAD',
      message:
        'Only the Director, the Deputy Director, a manager or the owner writes to the staff.',
    });
  }

  private reaches(row: SchoolStaffNotice, employeeId: number): boolean {
    if (row.audience === 'ALL') return true;
    return (row.employeeIds ?? []).map(Number).includes(Number(employeeId));
  }

  private officeView(n: SchoolStaffNotice) {
    return {
      id: Number(n.id),
      title: n.title,
      body: n.body,
      audience: n.audience,
      employeeIds: (n.employeeIds ?? []).map(Number),
      readBy: n.readBy ?? {},
      isActive: n.isActive,
      createdByName: n.createdByName,
      createdAt: n.createdAt,
    };
  }

  async list(query: { branchId: number; mine?: string }, actor: ScopeActor) {
    const who = await this.whoIs(query.branchId, actor);
    if (String(query.mine ?? '') === '1') {
      if (!who.employee)
        return { employee: null, canSend: who.head, items: [] };
      const me = Number(who.employee.id);
      const rows = await this.notices.find({
        where: { branchId: query.branchId, isActive: true },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: 200,
      });
      const items = rows
        .filter((n) => this.reaches(n, me))
        .slice(0, MINE_LIMIT)
        .map((n) => ({
          id: Number(n.id),
          title: n.title,
          body: n.body,
          toEveryone: n.audience === 'ALL',
          createdByName: n.createdByName,
          createdAt: n.createdAt,
          readAt: (n.readBy ?? {})[String(me)] ?? null,
        }));
      return {
        employee: { id: me, fullName: who.employee.fullName },
        canSend: who.head,
        unread: items.filter((n) => !n.readAt).length,
        items,
      };
    }
    if (!who.head) this.refuseNotHead();
    const rows = await this.notices.find({
      where: { branchId: query.branchId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 200,
    });
    return { canSend: true, items: rows.map((n) => this.officeView(n)) };
  }

  /** Write to the staff. Heads only; the people named must be on the list. */
  async send(dto: SendSchoolStaffNoticeDto, actor: ScopeActor) {
    const who = await this.whoIs(dto.branchId, actor);
    if (!who.head) this.refuseNotHead();
    const body = text(dto.body).slice(0, 4000);
    if (!body) throw new BadRequestException('Write the message.');
    let employeeIds: number[] | null = null;
    if (dto.audience === 'PEOPLE') {
      const wanted = [...new Set((dto.employeeIds ?? []).map(Number))].filter(
        (id) => Number.isInteger(id) && id > 0,
      );
      if (!wanted.length) {
        throw new BadRequestException(
          'Name at least one person, or send the message to everyone.',
        );
      }
      const staff = await this.employees.find({
        where: { branchId: dto.branchId },
      });
      const onList = new Set(staff.map((e) => Number(e.id)));
      const missing = wanted.filter((id) => !onList.has(id));
      if (missing.length) {
        throw new NotFoundException(
          `No person #${missing.join(', #')} on this branch's staff list.`,
        );
      }
      employeeIds = wanted;
    }
    const row = this.notices.create({
      branchId: dto.branchId,
      title: text(dto.title).slice(0, 200) || null,
      body,
      audience: dto.audience === 'PEOPLE' ? 'PEOPLE' : 'ALL',
      employeeIds,
      readBy: {},
      isActive: true,
      createdByUserId: who.actorId,
      createdByName: who.name || null,
    });
    return this.officeView(await this.notices.save(row));
  }

  private async load(id: number, branchId: number) {
    const row = await this.notices.findOne({ where: { id, branchId } });
    if (!row) throw new NotFoundException(`Message ${id} not found.`);
    return row;
  }

  /** Take a message down, or show it again. It stays on the office's list. */
  async setActive(
    id: number,
    dto: SetSchoolStaffNoticeActiveDto,
    actor: ScopeActor,
  ) {
    const who = await this.whoIs(dto.branchId, actor);
    if (!who.head) this.refuseNotHead();
    const row = await this.load(id, dto.branchId);
    // One column, not the entity: a save would write back a stale `readBy`
    // over a teacher's "I have read this" that landed meanwhile.
    await this.notices.update(
      { id: row.id, branchId: dto.branchId },
      { isActive: dto.isActive },
    );
    return this.officeView({ ...row, isActive: dto.isActive });
  }

  /** The person's own "I have read this". Merged in the database, so two
   *  teachers reading at the same moment both stay recorded. */
  async markRead(id: number, dto: ReadSchoolStaffNoticeDto, actor: ScopeActor) {
    const row = await this.load(id, dto.branchId);
    const who = await this.whoIs(dto.branchId, actor);
    if (
      !who.employee ||
      !row.isActive ||
      !this.reaches(row, Number(who.employee.id))
    ) {
      throw new ForbiddenException({
        code: 'SCHOOL_STAFF_NOTICE_NOT_YOURS',
        message: 'This message is not addressed to you.',
      });
    }
    const me = String(who.employee.id);
    const already = (row.readBy ?? {})[me];
    if (already) return { id: Number(row.id), readAt: already };
    const readAt = new Date().toISOString();
    await this.notices.query(
      `UPDATE "pos_school_staff_notices"
          SET "readBy" = coalesce("readBy", '{}'::jsonb) || $1::jsonb
        WHERE "id" = $2 AND "branchId" = $3
          AND NOT jsonb_exists(coalesce("readBy", '{}'::jsonb), $4)`,
      [JSON.stringify({ [me]: readAt }), row.id, dto.branchId, me],
    );
    return { id: Number(row.id), readAt };
  }
}
