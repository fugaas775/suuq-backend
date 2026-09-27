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
  GuardianPortalChangePasswordDto,
  ResetSchoolGuardianPasswordDto,
  UpdateSchoolGuardianDto,
} from './dto/school-guardian.dto';
import { SchoolGuardianPupil } from './entities/school-guardian-pupil.entity';
import { SchoolGuardian } from './entities/school-guardian.entity';
import {
  dedupeUsername,
  folioMoney,
  guardianFolioView,
  guardianReceiptView,
  isPupilRecord,
  normalizePhoneKey,
  pupilOf,
  suggestGuardianUsername,
} from './school-guardian.util';

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
    private readonly attendance: AttendanceService,
    private readonly timetable: SchoolTimetableService,
    private readonly auth: AuthService,
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

  private async foliosById(ids: number[]): Promise<Map<number, PosSuspendedCart>> {
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
      out.get(key)!.push(row);
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
    const links = await this.pupilsByGuardian(guardians.map((g) => Number(g.id)));
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
      const key = phoneKey.length >= 7 ? `phone:${phoneKey}` : `folio:${p.folioId}`;
      if (!families.has(key)) {
        families.set(key, {
          key,
          phone: p.guardianPhone,
          guardianName: p.guardianName,
          pupils: [],
        });
      }
      const family = families.get(key)!;
      if (!family.guardianName && p.guardianName) family.guardianName = p.guardianName;
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
    items.sort((a, b) =>
      (a.pupils[0]?.classCode || '').localeCompare(b.pupils[0]?.classCode || '') ||
      (a.pupils[0]?.name || '').localeCompare(b.pupils[0]?.name || ''),
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
    if (!row) throw new NotFoundException('Parent login not found on this school.');
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

    const clash = await this.users.findOne({ where: { posUsername: username } });
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
    const staleByEmail = await this.users.findOne({ where: { email: internalEmail } });
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
      const savedGuardian = await em.getRepository(SchoolGuardian).save(guardian);
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
    const links = (await this.pupilsByGuardian([Number(g.id)])).get(Number(g.id)) ?? [];
    const [users, folios] = await Promise.all([
      this.usersById([g.userId]),
      this.foliosById(links.map((l) => Number(l.folioId))),
    ]);
    return this.toOfficeView(g, users.get(Number(g.userId)), links, folios);
  }

  async update(id: number, dto: UpdateSchoolGuardianDto) {
    const g = await this.findGuardianOnBranch(id, dto.branchId);
    const patch: Partial<SchoolGuardian> = {};
    if (dto.displayName !== undefined) patch.displayName = text(dto.displayName) || null;
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
      const existing = await this.pupils.find({ where: { guardianId: Number(g.id) } });
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
    await this.guardians.update({ id: Number(g.id) }, { passwordIssuedAt: new Date() });
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
    const elsewhere = await this.guardians.count({ where: { userId: g.userId } });
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
      .map((r) => ({ guardian: r, branch: byId.get(Number(r.branchId))! }));
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
    const links = await this.pupilsByGuardian(held.map((h) => Number(h.guardian.id)));
    const folios = await this.foliosById(
      [...links.values()].flat().map((l) => Number(l.folioId)),
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
      },
      schools: held.map(({ guardian, branch }) => ({
        ...this.schoolView(branch),
        guardian: {
          id: Number(guardian.id),
          displayName: guardian.displayName ?? null,
          phone: guardian.phone ?? null,
          relationship: guardian.relationship ?? null,
        },
        pupils: (links.get(Number(guardian.id)) ?? []).map((l) =>
          this.pupilSummary(folios.get(Number(l.folioId)), Number(l.folioId)),
        ),
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
    const owner = held.find((h) => Number(h.guardian.id) === Number(link.guardianId));
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

    const [attendanceDays, attendanceLessons, sales, loans, timetable, classRow] =
      await Promise.all([
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
    const receipts = [...sales, ...returns.filter((r) => !seen.has(Number(r.id)))]
      .sort((a, b) =>
        String(b.occurredAt ?? '').localeCompare(String(a.occurredAt ?? '')),
      )
      .map((co) => guardianReceiptView(co as unknown as Record<string, any>));

    // The class teacher: the home-room employee when the registry links
    // one, else the name the registry recorded. Never a phone — the school's
    // own number is the family's contact.
    let classTeacher: { fullName: string; jobTitle: string | null } | null = null;
    const homeroomId = Number(classRow?.homeroomEmployeeId);
    if (homeroomId > 0) {
      const emp = await this.employees.findOne({ where: { id: homeroomId, branchId } });
      if (emp) classTeacher = { fullName: emp.fullName, jobTitle: emp.jobTitle ?? null };
    }
    if (!classTeacher && text(classRow?.homeroomTeacherName)) {
      classTeacher = { fullName: text(classRow?.homeroomTeacherName), jobTitle: null };
    }

    const wanted = fold(p.classCode);
    return {
      school: this.schoolView(branch),
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
        days: attendanceDays.items,
        lessons: attendanceLessons.items,
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
    return { status: 'PASSWORD_CHANGED' };
  }
}
