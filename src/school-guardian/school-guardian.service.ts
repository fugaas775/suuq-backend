import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AttendanceSubjectType } from '../attendance/entities/attendance-mark.entity';
import { Branch } from '../branches/entities/branch.entity';
import { BranchEmployee } from '../payroll/entities/branch-employee.entity';
import {
  PosCheckout,
  PosCheckoutTransactionType,
} from '../pos-sync/entities/pos-checkout.entity';
import {
  PosSuspendedCart,
  PosSuspendedCartStatus,
} from '../pos-sync/entities/pos-suspended-cart.entity';
import { SchoolClass } from '../school/entities/school-class.entity';
import { SchoolTextbookLoan } from '../school/entities/school-textbook-loan.entity';
import { SchoolTimetableService } from '../school/school-timetable.service';
import { User } from '../users/entities/user.entity';
import {
  CreateSchoolGuardianDto,
  CreateSchoolNoticeDto,
  GuardianPortalChangePasswordDto,
  ResetSchoolGuardianPasswordDto,
  UpdateSchoolGuardianDto,
  UpdateSchoolNoticeDto,
} from './dto/school-guardian.dto';
import { SchoolGuardianPupil } from './entities/school-guardian-pupil.entity';
import { SchoolGuardian } from './entities/school-guardian.entity';
import {
  SchoolNotice,
  SchoolNoticeAudience,
} from './entities/school-notice.entity';
import {
  dedupeUsername,
  folioMoney,
  guardianFolioView,
  guardianReceiptView,
  isPupilRecord,
  localDayIn,
  noticeIsLive,
  noticeReaches,
  normalizePhoneKey,
  pupilOf,
  rankClassByTerm,
  readReports,
  schoolTimeZone,
  suggestGuardianUsername,
} from './school-guardian.util';
import { SchoolHomeworkService } from './school-homework.service';
import { SchoolMessageService } from './school-message.service';

const text = (v: unknown) => String(v ?? '').trim();
const fold = (v: unknown) => text(v).toLowerCase();

type Actor = { id?: number | null; email?: string | null; roles?: string[] };

export const GUARDIAN_INTERNAL_EMAIL_PREFIX = 'pos.g.';

/**
 * Parents' logins.
 *
 * Two halves over the same two tables. The OFFICE half (list / suggestions /
 * create / update / reset / remove) runs behind the school's own guards and
 * ENROL_STUDENT, the same right that puts a child on the roll. The PORTAL half
 * (login / me / pupil / change-password) is reached by the parent with an
 * ordinary JWT and is scoped by nothing but the link rows: every read starts
 * from "the active guardianships of THIS user" and never takes a branch id
 * from the caller.
 */
@Injectable()
export class SchoolGuardianService {
  constructor(
    @InjectRepository(SchoolGuardian)
    private readonly guardians: Repository<SchoolGuardian>,
    @InjectRepository(SchoolGuardianPupil)
    private readonly pupils: Repository<SchoolGuardianPupil>,
    @InjectRepository(PosSuspendedCart)
    private readonly carts: Repository<PosSuspendedCart>,
    @InjectRepository(PosCheckout)
    private readonly checkouts: Repository<PosCheckout>,
    @InjectRepository(Branch)
    private readonly branches: Repository<Branch>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(SchoolClass)
    private readonly classes: Repository<SchoolClass>,
    @InjectRepository(BranchEmployee)
    private readonly employees: Repository<BranchEmployee>,
    @InjectRepository(SchoolTextbookLoan)
    private readonly loans: Repository<SchoolTextbookLoan>,
    @InjectRepository(SchoolNotice)
    private readonly notices: Repository<SchoolNotice>,
    private readonly attendance: AttendanceService,
    private readonly timetable: SchoolTimetableService,
    private readonly auth: AuthService,
    private readonly homework: SchoolHomeworkService,
    private readonly messages: SchoolMessageService,
  ) {}

  // ── shared reads ─────────────────────────────────────────────────────────

  /** Every SUSPENDED SCHOOL pupil record on the branch (leavers included). */
  private async pupilRecords(branchId: number): Promise<PosSuspendedCart[]> {
    const rows = await this.carts
      .createQueryBuilder('c')
      .where('c."branchId" = :branchId', { branchId })
      .andWhere('c.status = :status', {
        status: PosSuspendedCartStatus.SUSPENDED,
      })
      .andWhere(
        `upper(coalesce(c."cartSnapshot" ->> 'serviceFormat', '')) = 'SCHOOL'`,
      )
      .orderBy('c.id', 'ASC')
      .getMany();
    return rows.filter((r) => isPupilRecord(r));
  }

  private async foliosById(
    ids: number[],
  ): Promise<Map<number, PosSuspendedCart>> {
    const unique = [...new Set(ids.map((n) => Number(n)).filter((n) => n > 0))];
    if (!unique.length) return new Map();
    const rows = await this.carts.find({ where: { id: In(unique) } });
    return new Map(rows.map((r) => [Number(r.id), r]));
  }

  private async usersById(ids: number[]): Promise<Map<number, User>> {
    const unique = [...new Set(ids.map((n) => Number(n)).filter((n) => n > 0))];
    if (!unique.length) return new Map();
    const rows = await this.users.find({ where: { id: In(unique) } });
    return new Map(rows.map((r) => [Number(r.id), r]));
  }

  private async pupilsByGuardian(
    guardianIds: number[],
  ): Promise<Map<number, SchoolGuardianPupil[]>> {
    const out = new Map<number, SchoolGuardianPupil[]>();
    if (!guardianIds.length) return out;
    const rows = await this.pupils.find({
      where: { guardianId: In(guardianIds) },
      order: { id: 'ASC' },
    });
    for (const row of rows) {
      const key = Number(row.guardianId);
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(row);
    }
    return out;
  }

  private pupilSummary(row: PosSuspendedCart | undefined, folioId: number) {
    if (!row) {
      return {
        folioId,
        name: '',
        classCode: '',
        admissionNo: '',
        status: 'MISSING',
        leftOn: null,
        money: null,
      };
    }
    const p = pupilOf(row);
    return {
      folioId: p.folioId,
      name: p.name,
      classCode: p.classCode,
      admissionNo: p.admissionNo,
      enrolledAt: p.enrolledAt,
      status: p.status,
      leftOn: p.leftOn,
      money: folioMoney(row),
    };
  }

  private toOfficeView(
    g: SchoolGuardian,
    user: User | undefined,
    links: SchoolGuardianPupil[],
    folios: Map<number, PosSuspendedCart>,
  ) {
    return {
      id: Number(g.id),
      branchId: g.branchId,
      userId: g.userId,
      username: user?.posUsername ?? null,
      displayName: g.displayName ?? user?.displayName ?? null,
      phone: g.phone ?? null,
      relationship: g.relationship ?? null,
      isActive: g.isActive !== false && user?.isActive !== false,
      createdByName: g.createdByName ?? null,
      passwordIssuedAt: g.passwordIssuedAt ?? null,
      lastLoginAt: g.lastLoginAt ?? null,
      createdAt: g.createdAt,
      pupils: links.map((l) =>
        this.pupilSummary(folios.get(Number(l.folioId)), Number(l.folioId)),
      ),
    };
  }

  // ── office ───────────────────────────────────────────────────────────────

  async list(branchId: number) {
    const rows = await this.guardians.find({
      where: { branchId },
      order: { displayName: 'ASC', id: 'ASC' },
    });
    const links = await this.pupilsByGuardian(rows.map((r) => Number(r.id)));
    const folioIds = [...links.values()].flat().map((l) => Number(l.folioId));
    const [users, folios] = await Promise.all([
      this.usersById(rows.map((r) => r.userId)),
      this.foliosById(folioIds),
    ]);
    return {
      items: rows.map((g) =>
        this.toOfficeView(
          g,
          users.get(Number(g.userId)),
          links.get(Number(g.id)) ?? [],
          folios,
        ),
      ),
    };
  }

  /**
   * Families on the roll with no login yet, grouped by the guardian's phone
   * as the folio records it — siblings share a phone, so they share a login.
   * A pupil with no phone stands as a family of one. Leavers are left out:
   * this is the office's to-do list, and a child who has left is not on it.
   */
  async suggestions(branchId: number) {
    const [records, guardians] = await Promise.all([
      this.pupilRecords(branchId),
      this.guardians.find({ where: { branchId, isActive: true } }),
    ]);
    const links = await this.pupilsByGuardian(
      guardians.map((g) => Number(g.id)),
    );
    const linked = new Set(
      [...links.values()].flat().map((l) => Number(l.folioId)),
    );
    const families = new Map<
      string,
      {
        key: string;
        phone: string;
        guardianName: string;
        pupils: ReturnType<typeof pupilOf>[];
      }
    >();
    for (const row of records) {
      const p = pupilOf(row);
      if (p.status !== 'ACTIVE') continue;
      if (linked.has(p.folioId)) continue;
      const phoneKey = normalizePhoneKey(p.guardianPhone);
      const key =
        phoneKey.length >= 7 ? `phone:${phoneKey}` : `folio:${p.folioId}`;
      if (!families.has(key)) {
        families.set(key, {
          key,
          phone: p.guardianPhone,
          guardianName: p.guardianName,
          pupils: [],
        });
      }
      const family = families.get(key);
      if (!family.guardianName && p.guardianName)
        family.guardianName = p.guardianName;
      family.pupils.push(p);
    }

    // Usernames: the phone, else the name — and never one already taken.
    const bases = new Map<string, string>();
    for (const family of families.values()) {
      bases.set(
        family.key,
        suggestGuardianUsername({
          phone: family.phone,
          guardianName: family.guardianName,
        }),
      );
    }
    const candidates = [...new Set([...bases.values()].filter(Boolean))];
    const taken = new Set<string>();
    if (candidates.length) {
      const held = await this.users
        .createQueryBuilder('u')
        .select('u."posUsername"', 'posUsername')
        .where(
          `u."posUsername" IS NOT NULL AND (u."posUsername" IN (:...names) OR u."posUsername" ~ :re)`,
          {
            names: candidates,
            re: `^(${candidates.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\.[0-9]+$`,
          },
        )
        .getRawMany<{ posUsername: string }>();
      for (const h of held) taken.add(fold(h.posUsername));
    }
    const items = [...families.values()].map((family) => {
      const base = bases.get(family.key) || '';
      const suggestedUsername = base ? dedupeUsername(base, taken) : '';
      if (suggestedUsername) taken.add(suggestedUsername);
      return {
        key: family.key,
        phone: family.phone,
        guardianName: family.guardianName,
        suggestedUsername,
        pupils: family.pupils.map((p) => ({
          folioId: p.folioId,
          name: p.name,
          classCode: p.classCode,
          admissionNo: p.admissionNo,
        })),
      };
    });
    items.sort(
      (a, b) =>
        (a.pupils[0]?.classCode || '').localeCompare(
          b.pupils[0]?.classCode || '',
        ) || (a.pupils[0]?.name || '').localeCompare(b.pupils[0]?.name || ''),
    );
    return {
      items,
      familiesWithoutLogin: items.length,
      pupilsWithoutLogin: items.reduce((n, f) => n + f.pupils.length, 0),
    };
  }

  /** The folios named must be THIS branch's pupils; anything else is refused by id. */
  private async assertPupilFolios(branchId: number, folioIds: number[]) {
    const unique = [...new Set(folioIds.map((n) => Number(n)))];
    const rows = await this.foliosById(unique);
    const bad = unique.filter((id) => {
      const row = rows.get(id);
      return (
        !row ||
        Number(row.branchId) !== Number(branchId) ||
        String(row.status).toUpperCase() !== PosSuspendedCartStatus.SUSPENDED ||
        !isPupilRecord(row)
      );
    });
    if (bad.length) {
      throw new NotFoundException(
        `Not a pupil of this school: record ${bad.join(', ')}.`,
      );
    }
    return unique;
  }

  private async actorName(actor: Actor): Promise<string | null> {
    if (!actor?.id) return null;
    const row = await this.users.findOne({ where: { id: Number(actor.id) } });
    return row?.displayName || row?.posUsername || row?.email || null;
  }

  private async findGuardianOnBranch(id: number, branchId: number) {
    const row = await this.guardians.findOne({ where: { id, branchId } });
    if (!row)
      throw new NotFoundException('Parent login not found on this school.');
    return row;
  }

  async create(dto: CreateSchoolGuardianDto, actor: Actor) {
    const branch = await this.branches.findOne({
      where: { id: dto.branchId, isActive: true },
    });
    if (!branch) throw new NotFoundException('Branch not found.');
    if (fold(branch.serviceFormat) !== 'school') {
      throw new ConflictException('Parents’ logins are a SCHOOL feature.');
    }
    const folioIds = await this.assertPupilFolios(dto.branchId, dto.folioIds);
    const username = fold(dto.username);

    const clash = await this.users.findOne({
      where: { posUsername: username },
    });
    if (clash) {
      throw new ConflictException({
        error: {
          code: 'SCHOOL_GUARDIAN_USERNAME_CONFLICT',
          message: 'This username is already in use.',
          details: { field: 'username' },
        },
      });
    }
    const internalEmail = `${GUARDIAN_INTERNAL_EMAIL_PREFIX}${username}@sys.internal`;
    const staleByEmail = await this.users.findOne({
      where: { email: internalEmail },
    });
    if (staleByEmail) {
      throw new ConflictException({
        error: {
          code: 'SCHOOL_GUARDIAN_USERNAME_CONFLICT',
          message: 'This username is already in use.',
          details: { field: 'username' },
        },
      });
    }

    const createdByName = await this.actorName(actor);
    const hashed = await bcrypt.hash(dto.password, 10);
    const displayName = text(dto.displayName) || null;

    const saved = await this.guardians.manager.transaction(async (em) => {
      const user = em.getRepository(User).create({
        email: internalEmail,
        posUsername: username,
        authMode: 'MANUAL',
        displayName: displayName ?? undefined,
        password: hashed,
        roles: [],
        isActive: true,
      });
      const savedUser = await em.getRepository(User).save(user);
      const guardian = em.getRepository(SchoolGuardian).create({
        branchId: dto.branchId,
        userId: savedUser.id,
        displayName,
        phone: text(dto.phone) || null,
        relationship: text(dto.relationship).toUpperCase() || null,
        isActive: true,
        createdByUserId: actor?.id ? Number(actor.id) : null,
        createdByName,
        passwordIssuedAt: new Date(),
        lastLoginAt: null,
      });
      const savedGuardian = await em
        .getRepository(SchoolGuardian)
        .save(guardian);
      await em.getRepository(SchoolGuardianPupil).save(
        folioIds.map((folioId) =>
          em.getRepository(SchoolGuardianPupil).create({
            guardianId: Number(savedGuardian.id),
            folioId,
          }),
        ),
      );
      return { user: savedUser, guardian: savedGuardian };
    });

    return this.view(Number(saved.guardian.id), dto.branchId);
  }

  private async view(id: number, branchId: number) {
    const g = await this.findGuardianOnBranch(id, branchId);
    const links =
      (await this.pupilsByGuardian([Number(g.id)])).get(Number(g.id)) ?? [];
    const [users, folios] = await Promise.all([
      this.usersById([g.userId]),
      this.foliosById(links.map((l) => Number(l.folioId))),
    ]);
    return this.toOfficeView(g, users.get(Number(g.userId)), links, folios);
  }

  async update(id: number, dto: UpdateSchoolGuardianDto) {
    const g = await this.findGuardianOnBranch(id, dto.branchId);
    const patch: Partial<SchoolGuardian> = {};
    if (dto.displayName !== undefined)
      patch.displayName = text(dto.displayName) || null;
    if (dto.phone !== undefined) patch.phone = text(dto.phone) || null;
    if (dto.relationship !== undefined) {
      patch.relationship = text(dto.relationship).toUpperCase() || null;
    }
    if (dto.isActive !== undefined) patch.isActive = dto.isActive !== false;
    if (Object.keys(patch).length) {
      await this.guardians.update({ id: Number(g.id) }, patch);
    }
    if (dto.displayName !== undefined) {
      await this.users.update(
        { id: g.userId },
        { displayName: text(dto.displayName) || undefined },
      );
    }
    if (dto.folioIds) {
      const folioIds = await this.assertPupilFolios(dto.branchId, dto.folioIds);
      const existing = await this.pupils.find({
        where: { guardianId: Number(g.id) },
      });
      const keep = new Set(folioIds);
      const drop = existing.filter((l) => !keep.has(Number(l.folioId)));
      const have = new Set(existing.map((l) => Number(l.folioId)));
      if (drop.length) await this.pupils.remove(drop);
      const add = folioIds.filter((f) => !have.has(f));
      if (add.length) {
        await this.pupils.save(
          add.map((folioId) =>
            this.pupils.create({ guardianId: Number(g.id), folioId }),
          ),
        );
      }
    }
    return this.view(Number(g.id), dto.branchId);
  }

  async resetPassword(id: number, dto: ResetSchoolGuardianPasswordDto) {
    const g = await this.findGuardianOnBranch(id, dto.branchId);
    const user = await this.users.findOne({ where: { id: g.userId } });
    if (!user || user.authMode !== 'MANUAL') {
      throw new ForbiddenException(
        'Only a login the office created can have its password reset here.',
      );
    }
    user.password = await bcrypt.hash(dto.password, 10);
    await this.users.save(user);
    await this.guardians.update(
      { id: Number(g.id) },
      { passwordIssuedAt: new Date() },
    );
    return { status: 'PASSWORD_RESET', id: Number(g.id) };
  }

  /**
   * Remove the login from this school. The user row goes too when it was one
   * the office created and no other school still holds it — so the username
   * is free again, as a deleted staff account's is.
   */
  async remove(id: number, branchId: number) {
    const g = await this.findGuardianOnBranch(id, branchId);
    await this.pupils.delete({ guardianId: Number(g.id) });
    await this.guardians.delete({ id: Number(g.id) });
    const elsewhere = await this.guardians.count({
      where: { userId: g.userId },
    });
    let userRemoved = false;
    if (!elsewhere) {
      const user = await this.users.findOne({ where: { id: g.userId } });
      if (user && user.authMode === 'MANUAL') {
        await this.users.remove(user);
        userRemoved = true;
      }
    }
    return { status: 'REMOVED', id: Number(g.id), userRemoved };
  }

  // ── notices to parents (office) ──────────────────────────────────────────

  private noticeView(n: SchoolNotice) {
    return {
      id: Number(n.id),
      branchId: n.branchId,
      title: n.title,
      body: n.body,
      audience: n.audience ?? 'ALL',
      classCodes: n.classCodes ?? [],
      publishedAt: n.publishedAt ?? n.createdAt ?? null,
      expiresAt: n.expiresAt ?? null,
      isActive: n.isActive !== false,
      createdByName: n.createdByName ?? null,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  }

  private normalizeNoticeAudience(
    audience: string | undefined,
    classCodes: string[] | undefined,
    current?: SchoolNotice,
  ): { audience: SchoolNoticeAudience; classCodes: string[] | null } {
    const wanted = text(audience ?? current?.audience ?? 'ALL').toUpperCase();
    const codes = [
      ...new Set(
        (classCodes ?? current?.classCodes ?? [])
          .map((c) => fold(c))
          .filter(Boolean),
      ),
    ];
    if (wanted === 'CLASSES' && !codes.length) {
      throw new BadRequestException(
        'Name at least one class, or send the notice to the whole school.',
      );
    }
    return {
      audience: wanted === 'CLASSES' ? 'CLASSES' : 'ALL',
      classCodes: wanted === 'CLASSES' ? codes : null,
    };
  }

  async listNotices(branchId: number) {
    const rows = await this.notices.find({
      where: { branchId },
      order: { publishedAt: 'DESC', id: 'DESC' },
      take: 200,
    });
    return { items: rows.map((n) => this.noticeView(n)) };
  }

  async createNotice(dto: CreateSchoolNoticeDto, actor: Actor) {
    const { audience, classCodes } = this.normalizeNoticeAudience(
      dto.audience,
      dto.classCodes,
    );
    const row = this.notices.create({
      branchId: dto.branchId,
      title: text(dto.title),
      body: text(dto.body),
      audience,
      classCodes,
      publishedAt: new Date(),
      expiresAt: text(dto.expiresAt) || null,
      isActive: true,
      createdByUserId: actor?.id ? Number(actor.id) : null,
      createdByName: await this.actorName(actor),
    });
    return this.noticeView(await this.notices.save(row));
  }

  async updateNotice(id: number, dto: UpdateSchoolNoticeDto) {
    const row = await this.notices.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException('Notice not found on this school.');
    if (dto.title !== undefined) row.title = text(dto.title);
    if (dto.body !== undefined) row.body = text(dto.body);
    if (dto.audience !== undefined || dto.classCodes !== undefined) {
      const { audience, classCodes } = this.normalizeNoticeAudience(
        dto.audience,
        dto.classCodes,
        row,
      );
      row.audience = audience;
      row.classCodes = classCodes;
    }
    if (dto.expiresAt !== undefined)
      row.expiresAt = text(dto.expiresAt) || null;
    if (dto.isActive !== undefined) row.isActive = dto.isActive !== false;
    return this.noticeView(await this.notices.save(row));
  }

  async removeNotice(id: number, branchId: number) {
    const row = await this.notices.findOne({ where: { id, branchId } });
    if (!row) throw new NotFoundException('Notice not found on this school.');
    await this.notices.remove(row);
    return { status: 'REMOVED', id };
  }

  /** The live notices a family sees: the whole school's, and their children's classes'. */
  private async noticesFor(
    held: { guardian: SchoolGuardian; branch: Branch }[],
    classesByBranch: Map<number, Set<string>>,
  ) {
    if (!held.length) return [];
    const branchIds = [...new Set(held.map((h) => Number(h.branch.id)))];
    const rows = await this.notices.find({
      where: { branchId: In(branchIds), isActive: true },
      order: { publishedAt: 'DESC', id: 'DESC' },
      take: 200,
    });
    const today = new Date().toISOString().slice(0, 10);
    const names = new Map(
      held.map((h) => [Number(h.branch.id), h.branch.name]),
    );
    return rows
      .filter((n) => noticeIsLive(n, today))
      .filter((n) =>
        noticeReaches(n, classesByBranch.get(Number(n.branchId)) ?? []),
      )
      .slice(0, 50)
      .map((n) => ({
        id: Number(n.id),
        branchId: n.branchId,
        schoolName: names.get(Number(n.branchId)) ?? null,
        title: n.title,
        body: n.body,
        audience: n.audience ?? 'ALL',
        classCodes: n.classCodes ?? [],
        publishedAt: n.publishedAt ?? n.createdAt ?? null,
        expiresAt: n.expiresAt ?? null,
      }));
  }

  // ── portal ───────────────────────────────────────────────────────────────

  private async activeGuardianships(userId: number) {
    if (!userId) return [];
    const rows = await this.guardians.find({
      where: { userId, isActive: true },
      order: { id: 'ASC' },
    });
    if (!rows.length) return [];
    const branches = await this.branches.find({
      where: { id: In(rows.map((r) => r.branchId)), isActive: true },
    });
    const byId = new Map(branches.map((b) => [Number(b.id), b]));
    return rows
      .filter((r) => byId.has(Number(r.branchId)))
      .map((r) => ({ guardian: r, branch: byId.get(Number(r.branchId)) }));
  }

  private schoolView(branch: Branch) {
    return {
      branchId: Number(branch.id),
      name: branch.name,
      logoUrl: branch.logoUrl ?? null,
      phone: branch.phone ?? null,
      address: branch.address ?? null,
      city: branch.city ?? null,
      country: branch.country ?? null,
      timezone: branch.timezone ?? null,
      taxEnabled: branch.taxEnabled === true,
      taxRate: Number(branch.taxRate) || 0,
      taxInclusive: branch.taxInclusive === true,
      taxName: branch.taxName ?? null,
    };
  }

  /**
   * A parent signs in with the same username/password check as everyone
   * else, and is then let in only when at least one school holds an active
   * guardianship for that user. A staff login answers 403 here, not a
   * parent's page with nothing on it.
   */
  async login(username: string, password: string) {
    const identifier = fold(username);
    if (!identifier || identifier.includes('@')) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      });
    }
    const tokens = await this.auth.loginWithIdentifier(identifier, password);
    const held = await this.activeGuardianships(Number(tokens.user.id));
    if (!held.length) {
      throw new ForbiddenException({
        error: {
          code: 'SCHOOL_GUARDIAN_ACCESS_DENIED',
          message:
            'This login is not a parent’s login at any school. Ask the school office for yours.',
        },
      });
    }
    await this.guardians.update(
      { id: In(held.map((h) => Number(h.guardian.id))) },
      { lastLoginAt: new Date() },
    );
    const me = await this.me(Number(tokens.user.id));
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      ...me,
    };
  }

  async me(userId: number) {
    const held = await this.activeGuardianships(userId);
    if (!held.length) {
      throw new ForbiddenException({
        error: {
          code: 'SCHOOL_GUARDIAN_ACCESS_DENIED',
          message: 'This login is not a parent’s login at any school.',
        },
      });
    }
    const user = await this.users.findOne({ where: { id: userId } });
    const links = await this.pupilsByGuardian(
      held.map((h) => Number(h.guardian.id)),
    );
    const folios = await this.foliosById(
      [...links.values()].flat().map((l) => Number(l.folioId)),
    );
    // The classes this family's children sit in, per school — what decides
    // which class notices reach them.
    const classesByBranch = new Map<number, Set<string>>();
    for (const { guardian, branch } of held) {
      const set = classesByBranch.get(Number(branch.id)) ?? new Set<string>();
      for (const l of links.get(Number(guardian.id)) ?? []) {
        const row = folios.get(Number(l.folioId));
        const code = row ? fold(pupilOf(row).classCode) : '';
        if (code) set.add(code);
      }
      classesByBranch.set(Number(branch.id), set);
    }
    // Still on the password the office printed on the card? True until the
    // parent changes it themselves AFTER the office last set it.
    const usingIssuedPassword = held.every(({ guardian }) => {
      const issued = guardian.passwordIssuedAt
        ? new Date(guardian.passwordIssuedAt).getTime()
        : 0;
      const changed = guardian.passwordChangedAt
        ? new Date(guardian.passwordChangedAt).getTime()
        : 0;
      return !changed || changed < issued;
    });
    // What the home page raises a flag for, per child: today's register
    // mark (an absence a parent should hear of the same morning), a word
    // from the school not yet opened, and homework falling due. Read per
    // school in one query each, never per child.
    const unread = await this.messages.unreadByFolio(
      held.map((h) => Number(h.guardian.id)),
    );
    const todayByBranch = new Map<
      number,
      Map<string, { status: string; note: string | null }>
    >();
    const dueByBranch = new Map<number, Map<string, number>>();
    await Promise.all(
      held.map(async ({ branch }) => {
        const branchId = Number(branch.id);
        if (todayByBranch.has(branchId)) return;
        const today = localDayIn(schoolTimeZone(branch));
        const [marks, due] = await Promise.all([
          this.attendance.list(AttendanceSubjectType.STUDENT, {
            branchId,
            date: today,
          }),
          this.homework.dueCounts(
            branchId,
            classesByBranch.get(branchId) ?? [],
            today,
          ),
        ]);
        todayByBranch.set(
          branchId,
          new Map(
            marks.items.map((m) => [
              String(m.subjectRef),
              { status: String(m.status), note: m.note ?? null },
            ]),
          ),
        );
        dueByBranch.set(branchId, due);
      }),
    );
    return {
      user: {
        id: userId,
        username: user?.posUsername ?? null,
        displayName:
          held.find((h) => h.guardian.displayName)?.guardian.displayName ??
          user?.displayName ??
          null,
        canChangePassword: user?.authMode === 'MANUAL',
        usingIssuedPassword: user?.authMode === 'MANUAL' && usingIssuedPassword,
      },
      notices: await this.noticesFor(held, classesByBranch),
      schools: held.map(({ guardian, branch }) => ({
        ...this.schoolView(branch),
        today: localDayIn(schoolTimeZone(branch)),
        guardian: {
          id: Number(guardian.id),
          displayName: guardian.displayName ?? null,
          phone: guardian.phone ?? null,
          relationship: guardian.relationship ?? null,
        },
        pupils: (links.get(Number(guardian.id)) ?? []).map((l) => {
          const folioId = Number(l.folioId);
          const row = folios.get(folioId);
          const summary = this.pupilSummary(row, folioId);
          const code = row ? fold(pupilOf(row).classCode) : '';
          return {
            ...summary,
            todayMark:
              todayByBranch.get(Number(branch.id))?.get(String(folioId)) ??
              null,
            unreadMessages: unread.get(folioId) ?? 0,
            homeworkDue: code
              ? (dueByBranch.get(Number(branch.id))?.get(code) ?? 0)
              : 0,
          };
        }),
      })),
    };
  }

  /** The link that lets THIS user read THIS pupil — or nothing. */
  private async linkFor(userId: number, folioId: number) {
    const held = await this.activeGuardianships(userId);
    if (!held.length) return null;
    const link = await this.pupils.findOne({
      where: {
        folioId,
        guardianId: In(held.map((h) => Number(h.guardian.id))),
      },
    });
    if (!link) return null;
    const owner = held.find(
      (h) => Number(h.guardian.id) === Number(link.guardianId),
    );
    return owner ? { ...owner, link } : null;
  }

  /**
   * One child, everything the school holds about them that a parent may see:
   * the record itself (the FE's statement and money helpers read it as the
   * office's copy), the receipts settled against it, the day register, the
   * books out, and the class's week. Every read is filtered to this pupil in
   * the query, never in the response.
   */
  async pupil(userId: number, folioId: number) {
    const held = await this.linkFor(userId, folioId);
    if (!held) throw new NotFoundException('No such pupil on this login.');
    const { branch } = held;
    const branchId = Number(branch.id);
    const row = await this.carts.findOne({ where: { id: folioId, branchId } });
    if (!row) throw new NotFoundException('No such pupil on this login.');
    const p = pupilOf(row);

    const [
      attendanceDays,
      attendanceLessons,
      sales,
      loans,
      timetable,
      classRow,
    ] = await Promise.all([
      this.attendance.list(AttendanceSubjectType.STUDENT, {
        branchId,
        subjectRef: String(folioId),
      }),
      this.attendance.listLessons(AttendanceSubjectType.STUDENT, {
        branchId,
        subjectRef: String(folioId),
      }),
      this.checkouts
        .createQueryBuilder('c')
        .where('c."branchId" = :branchId', { branchId })
        .andWhere(
          `(c."metadata" ->> 'folioId' = :folioText OR c."suspendedCartId" = :folioId)`,
          { folioText: String(folioId), folioId },
        )
        .orderBy('c."occurredAt"', 'DESC')
        .take(300)
        .getMany(),
      this.loans.find({
        where: { branchId, folioId },
        order: { issuedAt: 'DESC', id: 'DESC' },
      }),
      this.timetable.get(branchId),
      p.classCode
        ? this.classes
            .createQueryBuilder('k')
            .where('k."branchId" = :branchId', { branchId })
            .andWhere('lower(k.code) = :code', { code: fold(p.classCode) })
            .getOne()
        : Promise.resolve(null),
    ]);

    // Refunds are RETURN rows; the ones minted before the folio id was
    // stamped carry only the receipt they reverse. Fetch those by that.
    const saleNumbers = sales
      .filter((s) => s.transactionType === PosCheckoutTransactionType.SALE)
      .map((s) => text(s.receiptNumber))
      .filter(Boolean);
    let returns: PosCheckout[] = [];
    if (saleNumbers.length) {
      returns = await this.checkouts
        .createQueryBuilder('c')
        .where('c."branchId" = :branchId', { branchId })
        .andWhere('c."transactionType" = :type', {
          type: PosCheckoutTransactionType.RETURN,
        })
        .andWhere(
          `c."metadata" -> 'returnContext' ->> 'sourceReceiptNumber' IN (:...numbers)`,
          { numbers: saleNumbers },
        )
        .take(300)
        .getMany();
    }
    const seen = new Set(sales.map((s) => Number(s.id)));
    const receipts = [
      ...sales,
      ...returns.filter((r) => !seen.has(Number(r.id))),
    ]
      .sort((a, b) =>
        String(b.occurredAt ?? '').localeCompare(String(a.occurredAt ?? '')),
      )
      .map((co) => guardianReceiptView(co as unknown as Record<string, any>));

    // The class teacher: the home-room employee when the registry links
    // one, else the name the registry recorded. Never a phone — the school's
    // own number is the family's contact.
    let classTeacher: { fullName: string; jobTitle: string | null } | null =
      null;
    const homeroomId = Number(classRow?.homeroomEmployeeId);
    if (homeroomId > 0) {
      const emp = await this.employees.findOne({
        where: { id: homeroomId, branchId },
      });
      if (emp)
        classTeacher = {
          fullName: emp.fullName,
          jobTitle: emp.jobTitle ?? null,
        };
    }
    if (!classTeacher && text(classRow?.homeroomTeacherName)) {
      classTeacher = {
        fullName: text(classRow?.homeroomTeacherName),
        jobTitle: null,
      };
    }

    const wanted = fold(p.classCode);

    // Homework set for the class, the family's unread count, and where the
    // child stands in the class this term — ranked over the class's live
    // pupils the way the office's result sheet ranks them. The classmates'
    // records are read here and never handed over: only this child's place
    // and the size of the field leave the server.
    const [homework, unread, classmates] = await Promise.all([
      wanted
        ? this.homework.forClasses(branchId, [wanted])
        : Promise.resolve([]),
      this.messages.unreadByFolio([Number(held.guardian.id)]),
      wanted
        ? this.pupilRecords(branchId)
        : Promise.resolve([] as PosSuspendedCart[]),
    ]);
    const field = classmates.filter((r) => {
      const q = pupilOf(r);
      return fold(q.classCode) === wanted && q.status === 'ACTIVE';
    });
    const rank = readReports(row).map((report) => {
      const ranks = rankClassByTerm(field, report.term);
      const mine = ranks.get(folioId) ?? null;
      return {
        term: report.term,
        recordedPosition: report.position || null,
        position: mine?.position ?? null,
        of: mine?.of ?? null,
        complete: mine?.complete ?? null,
        subjectsMarked: mine?.subjectsMarked ?? null,
        subjectsInClass: mine?.subjectsInClass ?? null,
      };
    });

    return {
      school: this.schoolView(branch),
      homework,
      unreadMessages: unread.get(folioId) ?? 0,
      rank,
      guardian: {
        displayName: held.guardian.displayName ?? null,
        relationship: held.guardian.relationship ?? null,
      },
      pupil: {
        ...p,
        className: classRow?.name ?? null,
        gradeCode: classRow?.gradeCode ?? null,
        section: classRow?.section ?? null,
        money: folioMoney(row),
      },
      classTeacher,
      folio: guardianFolioView(row),
      receipts,
      attendance: {
        // The query is scoped to this pupil in the database; the filter here
        // is the belt, so a widened query can never hand a family the class.
        days: attendanceDays.items.filter(
          (r) => String(r.subjectRef) === String(folioId),
        ),
        lessons: attendanceLessons.items.filter(
          (r) => String(r.subjectRef) === String(folioId),
        ),
      },
      textbooks: loans.map((l) => ({
        id: Number(l.id),
        title: l.title,
        classCode: l.classCode,
        status: l.status,
        issuedAt: l.issuedAt,
        returnedAt: l.returnedAt ?? null,
        billedAmount: l.billedAmount ?? null,
        billedAt: l.billedAt ?? null,
      })),
      timetable: {
        title: timetable.title,
        periods: timetable.periods,
        shifts: timetable.shifts,
        slots: wanted
          ? timetable.slots.filter((s) => fold(s.classCode) === wanted)
          : [],
      },
    };
  }

  /** The family's conversation with the school about one child. */
  async pupilMessages(userId: number, folioId: number) {
    const held = await this.linkFor(userId, folioId);
    if (!held) throw new NotFoundException('No such pupil on this login.');
    const out = await this.messages.guardianThread(
      Number(held.branch.id),
      Number(held.guardian.id),
      folioId,
    );
    return { ...out, school: this.schoolView(held.branch) };
  }

  /** The family writes to the school about one child; the class's teachers and the office read it. */
  async sendPupilMessage(userId: number, folioId: number, body: string) {
    const held = await this.linkFor(userId, folioId);
    if (!held) throw new NotFoundException('No such pupil on this login.');
    const clean = text(body);
    if (!clean) throw new BadRequestException('Write a message first.');
    const branchId = Number(held.branch.id);
    const row = await this.carts.findOne({ where: { id: folioId, branchId } });
    if (!row) throw new NotFoundException('No such pupil on this login.');
    const user = await this.users.findOne({ where: { id: userId } });
    const senderName =
      held.guardian.displayName ||
      user?.displayName ||
      user?.posUsername ||
      null;
    const out = await this.messages.guardianSend(
      branchId,
      {
        id: Number(held.guardian.id),
        userId,
        displayName: held.guardian.displayName,
      },
      row,
      senderName,
      clean,
    );
    return { ...out, school: this.schoolView(held.branch) };
  }

  async changePassword(userId: number, dto: GuardianPortalChangePasswordDto) {
    const held = await this.activeGuardianships(userId);
    if (!held.length) {
      throw new ForbiddenException('This login is not a parent’s login.');
    }
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.password || user.authMode !== 'MANUAL') {
      throw new ForbiddenException(
        'This login’s password is managed elsewhere.',
      );
    }
    const ok = await bcrypt.compare(dto.currentPassword, user.password);
    if (!ok) {
      // 400, not 401: the parent IS signed in — a 401 here reads to every
      // client as an aged-out token and signs them out for a typo.
      throw new BadRequestException({
        error: {
          code: 'SCHOOL_GUARDIAN_WRONG_PASSWORD',
          message: 'The current password is not right.',
        },
      });
    }
    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.users.save(user);
    await this.guardians.update({ userId }, { passwordChangedAt: new Date() });
    return { status: 'PASSWORD_CHANGED' };
  }
}
