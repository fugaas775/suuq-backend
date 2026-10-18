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
import {
  PosSuspendedCart,
  PosSuspendedCartStatus,
} from '../pos-sync/entities/pos-suspended-cart.entity';
import { User } from '../users/entities/user.entity';
import {
  CreateSchoolStudentAccountDto,
  CreateSchoolStudentAccountsBulkDto,
  ResetSchoolStudentAccountPasswordDto,
  StudentPortalChangePasswordDto,
  UpdateSchoolStudentAccountDto,
} from './dto/school-student-account.dto';
import { SchoolStudentAccount } from './entities/school-student-account.entity';
import { SchoolGuardianService } from './school-guardian.service';
import {
  dedupeUsername,
  folioMoney,
  generateIssuedPassword,
  isPupilRecord,
  localDayIn,
  pupilOf,
  schoolTimeZone,
  suggestStudentUsername,
  STUDENT_LOGIN_MIN_GRADE,
  studentLoginGradeAllowed,
} from './school-guardian.util';
import { SchoolHomeworkService } from './school-homework.service';

const text = (v: unknown) => String(v ?? '').trim();
const fold = (v: unknown) => text(v).toLowerCase();

type Actor = { id?: number | null; email?: string | null; roles?: string[] };

export const STUDENT_INTERNAL_EMAIL_PREFIX = 'pos.s.';

const usernameConflict = () =>
  new ConflictException({
    error: {
      code: 'SCHOOL_STUDENT_USERNAME_CONFLICT',
      message: 'This username is already in use.',
      details: { field: 'username' },
    },
  });

/**
 * Pupils' own logins.
 *
 * Two halves over one table. The OFFICE half (list / suggestions / create /
 * bulk / update / reset / remove) runs behind the school's own guards and
 * ENROL_STUDENT, the right that puts a child on the roll. The PORTAL half
 * (login / me / pupil / change-password) is reached by the pupil with an
 * ordinary JWT and is scoped by nothing but the account rows: every read
 * starts from "the active student accounts of THIS user" and never takes a
 * branch id or a folio id from the caller on its own.
 *
 * What a pupil reads is the same dossier the family reads — the guardian
 * service assembles it — minus the family's conversation with the school:
 * the record, receipts, the register, books, the class's week, its homework,
 * the pupil's place in the class, and the notices that reach their class.
 */
@Injectable()
export class SchoolStudentAccountService {
  constructor(
    @InjectRepository(SchoolStudentAccount)
    private readonly accounts: Repository<SchoolStudentAccount>,
    @InjectRepository(PosSuspendedCart)
    private readonly carts: Repository<PosSuspendedCart>,
    @InjectRepository(Branch)
    private readonly branches: Repository<Branch>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly attendance: AttendanceService,
    private readonly auth: AuthService,
    private readonly homework: SchoolHomeworkService,
    private readonly guardians: SchoolGuardianService,
  ) {}

  // ── shared reads ─────────────────────────────────────────────────────────

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

  private pupilSummary(row: PosSuspendedCart | undefined, folioId: number) {
    if (!row) {
      return {
        folioId,
        name: '',
        classCode: '',
        admissionNo: '',
        enrolledAt: null as string | null,
        status: 'MISSING',
        leftOn: null as string | null,
        money: null as ReturnType<typeof folioMoney> | null,
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
    a: SchoolStudentAccount,
    user: User | undefined,
    folio: PosSuspendedCart | undefined,
  ) {
    return {
      id: Number(a.id),
      branchId: a.branchId,
      userId: a.userId,
      folioId: Number(a.folioId),
      username: user?.posUsername ?? null,
      displayName: a.displayName ?? user?.displayName ?? null,
      isActive: a.isActive !== false && user?.isActive !== false,
      createdByName: a.createdByName ?? null,
      passwordIssuedAt: a.passwordIssuedAt ?? null,
      lastLoginAt: a.lastLoginAt ?? null,
      createdAt: a.createdAt,
      pupil: this.pupilSummary(folio, Number(a.folioId)),
    };
  }

  // ── office ───────────────────────────────────────────────────────────────

  async list(branchId: number) {
    const rows = await this.accounts.find({
      where: { branchId },
      order: { displayName: 'ASC', id: 'ASC' },
    });
    const [users, folios] = await Promise.all([
      this.usersById(rows.map((r) => r.userId)),
      this.foliosById(rows.map((r) => Number(r.folioId))),
    ]);
    const items = rows.map((a) =>
      this.toOfficeView(
        a,
        users.get(Number(a.userId)),
        folios.get(Number(a.folioId)),
      ),
    );
    items.sort(
      (x, y) =>
        (x.pupil.classCode || '').localeCompare(y.pupil.classCode || '') ||
        (x.pupil.name || '').localeCompare(y.pupil.name || ''),
    );
    return { items };
  }

  /** The usernames already held that could collide with these candidates (exact, or `.N`-suffixed). */
  private async takenAmong(candidates: string[]): Promise<Set<string>> {
    const taken = new Set<string>();
    const names = [...new Set(candidates.filter(Boolean))];
    if (!names.length) return taken;
    const held = await this.users
      .createQueryBuilder('u')
      .select('u."posUsername"', 'posUsername')
      .where(
        `u."posUsername" IS NOT NULL AND (u."posUsername" IN (:...names) OR u."posUsername" ~ :re)`,
        {
          names,
          re: `^(${names.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\.[0-9]+$`,
        },
      )
      .getRawMany<{ posUsername: string }>();
    for (const h of held) taken.add(fold(h.posUsername));
    return taken;
  }

  /**
   * Pupils on the roll with no login yet, each with the username the office
   * would be offered. EVERY login counts as "has one", switched off or not
   * — a pupil the office cut off on purpose must not be offered a second,
   * working login by "Create logins for all". Leavers are left out: this is
   * the office's to-do list.
   */
  async suggestions(branchId: number) {
    const [records, accounts] = await Promise.all([
      this.guardians.pupilRecords(branchId),
      this.accounts.find({ where: { branchId } }),
    ]);
    const linked = new Set(accounts.map((a) => Number(a.folioId)));
    // Grade 6 and up only — the younger ones are not offered a login of their
    // own (see STUDENT_LOGIN_MIN_GRADE); their family's login reads them.
    const pupils = records
      .map((row) => pupilOf(row))
      .filter(
        (p) =>
          p.status === 'ACTIVE' &&
          !linked.has(p.folioId) &&
          studentLoginGradeAllowed(p.classCode),
      );
    const bases = new Map<number, string>();
    for (const p of pupils) {
      bases.set(
        p.folioId,
        suggestStudentUsername({ admissionNo: p.admissionNo, name: p.name }),
      );
    }
    const taken = await this.takenAmong([...bases.values()]);
    const items = pupils.map((p) => {
      const base = bases.get(p.folioId) || '';
      const suggestedUsername = base ? dedupeUsername(base, taken) : '';
      if (suggestedUsername) taken.add(suggestedUsername);
      return {
        folioId: p.folioId,
        name: p.name,
        classCode: p.classCode,
        admissionNo: p.admissionNo,
        guardianName: p.guardianName,
        guardianPhone: p.guardianPhone,
        suggestedUsername,
      };
    });
    items.sort(
      (a, b) =>
        (a.classCode || '').localeCompare(b.classCode || '') ||
        (a.name || '').localeCompare(b.name || ''),
    );
    return { items, pupilsWithoutLogin: items.length };
  }

  /** The folio named must be THIS school's pupil, or it is refused by id. */
  private async assertPupilFolio(branchId: number, folioId: number) {
    const row = (await this.foliosById([folioId])).get(Number(folioId));
    if (
      !row ||
      Number(row.branchId) !== Number(branchId) ||
      String(row.status).toUpperCase() !== PosSuspendedCartStatus.SUSPENDED ||
      !isPupilRecord(row)
    ) {
      throw new NotFoundException(
        `Not a pupil of this school: record ${folioId}.`,
      );
    }
    return row;
  }

  private async actorName(actor: Actor): Promise<string | null> {
    if (!actor?.id) return null;
    const row = await this.users.findOne({ where: { id: Number(actor.id) } });
    return row?.displayName || row?.posUsername || row?.email || null;
  }

  private async findOnBranch(id: number, branchId: number) {
    const row = await this.accounts.findOne({ where: { id, branchId } });
    if (!row)
      throw new NotFoundException('Student login not found on this school.');
    return row;
  }

  private async assertSchool(branchId: number) {
    const branch = await this.branches.findOne({
      where: { id: branchId, isActive: true },
    });
    if (!branch) throw new NotFoundException('Branch not found.');
    if (fold(branch.serviceFormat) !== 'school') {
      throw new ConflictException('Students’ logins are a SCHOOL feature.');
    }
    return branch;
  }

  private async assertUsernameFree(username: string, exceptUserId?: number) {
    const internalEmail = `${STUDENT_INTERNAL_EMAIL_PREFIX}${username}@sys.internal`;
    const [clash, staleByEmail] = await Promise.all([
      this.users.findOne({ where: { posUsername: username } }),
      this.users.findOne({ where: { email: internalEmail } }),
    ]);
    const taken = [clash, staleByEmail].some(
      (row) => row && Number(row.id) !== Number(exceptUserId ?? -1),
    );
    if (taken) throw usernameConflict();
    return internalEmail;
  }

  /** One pupil, one login — the user row and the account row in one transaction. */
  private async mint(
    branchId: number,
    row: PosSuspendedCart,
    username: string,
    password: string,
    displayName: string | null,
    actor: Actor,
    createdByName: string | null,
  ) {
    const existing = await this.accounts.findOne({
      where: { branchId, folioId: Number(row.id) },
    });
    if (existing) {
      throw new ConflictException({
        error: {
          code: 'SCHOOL_STUDENT_ALREADY_HAS_LOGIN',
          message: 'This pupil already has a login.',
          details: { folioId: Number(row.id) },
        },
      });
    }
    const internalEmail = await this.assertUsernameFree(username);
    const hashed = await bcrypt.hash(password, 10);
    const name = displayName || pupilOf(row).name || null;
    return this.accounts.manager.transaction(async (em) => {
      const user = em.getRepository(User).create({
        email: internalEmail,
        posUsername: username,
        authMode: 'MANUAL',
        displayName: name ?? undefined,
        password: hashed,
        roles: [],
        isActive: true,
      });
      const savedUser = await em.getRepository(User).save(user);
      const account = em.getRepository(SchoolStudentAccount).create({
        branchId,
        userId: savedUser.id,
        folioId: Number(row.id),
        displayName: name,
        isActive: true,
        createdByUserId: actor?.id ? Number(actor.id) : null,
        createdByName,
        passwordIssuedAt: new Date(),
        lastLoginAt: null,
      });
      return em.getRepository(SchoolStudentAccount).save(account);
    });
  }

  async create(dto: CreateSchoolStudentAccountDto, actor: Actor) {
    await this.assertSchool(dto.branchId);
    const row = await this.assertPupilFolio(dto.branchId, dto.folioId);
    if (!studentLoginGradeAllowed(pupilOf(row).classCode)) {
      throw new BadRequestException({
        error: {
          code: 'SCHOOL_STUDENT_BELOW_LOGIN_GRADE',
          message: `Pupils get their own login from Grade ${STUDENT_LOGIN_MIN_GRADE}. A younger child is read through their family's login.`,
          details: { field: 'folioId' },
        },
      });
    }
    const username = fold(dto.username);
    const createdByName = await this.actorName(actor);
    const saved = await this.mint(
      dto.branchId,
      row,
      username,
      dto.password,
      text(dto.displayName) || null,
      actor,
      createdByName,
    );
    return this.view(Number(saved.id), dto.branchId);
  }

  /**
   * Logins for a class, or the whole roll, in one call. Each pupil is minted
   * on their own (not one transaction): a refused username in the middle
   * must not undo two hundred good logins, and the office is told who was
   * skipped and why. The passwords ride back in clear, once, for the cards.
   */
  async createMany(dto: CreateSchoolStudentAccountsBulkDto, actor: Actor) {
    await this.assertSchool(dto.branchId);
    const wanted = [
      ...new Set(dto.folioIds.map((n) => Number(n)).filter((n) => n > 0)),
    ];
    const folios = await this.foliosById(wanted);
    const existing = await this.accounts.find({
      where: { branchId: dto.branchId, folioId: In(wanted) },
    });
    const already = new Set(existing.map((a) => Number(a.folioId)));
    const createdByName = await this.actorName(actor);
    const common = text(dto.password) || '';

    const created: Array<{
      id: number;
      folioId: number;
      name: string;
      classCode: string;
      admissionNo: string;
      guardianName: string;
      guardianPhone: string;
      username: string;
      password: string;
    }> = [];
    const skipped: Array<{ folioId: number; name: string; reason: string }> =
      [];
    const bases: Array<{ row: PosSuspendedCart; base: string }> = [];
    for (const folioId of wanted) {
      const row = folios.get(folioId);
      const ok =
        row &&
        Number(row.branchId) === Number(dto.branchId) &&
        String(row.status).toUpperCase() === PosSuspendedCartStatus.SUSPENDED &&
        isPupilRecord(row);
      if (!ok) {
        skipped.push({ folioId, name: '', reason: 'NOT_A_PUPIL' });
        continue;
      }
      const p = pupilOf(row);
      if (already.has(folioId)) {
        skipped.push({ folioId, name: p.name, reason: 'HAS_LOGIN' });
        continue;
      }
      if (!studentLoginGradeAllowed(p.classCode)) {
        skipped.push({ folioId, name: p.name, reason: 'BELOW_LOGIN_GRADE' });
        continue;
      }
      const base = suggestStudentUsername({
        admissionNo: p.admissionNo,
        name: p.name,
      });
      if (!base) {
        skipped.push({ folioId, name: p.name, reason: 'NO_USERNAME' });
        continue;
      }
      bases.push({ row, base });
    }
    const taken = await this.takenAmong(bases.map((b) => b.base));
    for (const { row, base } of bases) {
      const p = pupilOf(row);
      const username = dedupeUsername(base, taken);
      taken.add(username);
      const password = common || generateIssuedPassword();
      try {
        const saved = await this.mint(
          dto.branchId,
          row,
          username,
          password,
          null,
          actor,
          createdByName,
        );
        created.push({
          id: Number(saved.id),
          folioId: p.folioId,
          name: p.name,
          classCode: p.classCode,
          admissionNo: p.admissionNo,
          guardianName: p.guardianName,
          guardianPhone: p.guardianPhone,
          username,
          password,
        });
      } catch (err) {
        const code = (err as { response?: { error?: { code?: string } } })
          ?.response?.error?.code;
        skipped.push({
          folioId: p.folioId,
          name: p.name,
          reason: code || 'FAILED',
        });
      }
    }
    return { created, skipped, createdCount: created.length };
  }

  private async view(id: number, branchId: number) {
    const a = await this.findOnBranch(id, branchId);
    const [users, folios] = await Promise.all([
      this.usersById([a.userId]),
      this.foliosById([Number(a.folioId)]),
    ]);
    return this.toOfficeView(
      a,
      users.get(Number(a.userId)),
      folios.get(Number(a.folioId)),
    );
  }

  async update(id: number, dto: UpdateSchoolStudentAccountDto) {
    const a = await this.findOnBranch(id, dto.branchId);
    const patch: Partial<SchoolStudentAccount> = {};
    if (dto.displayName !== undefined)
      patch.displayName = text(dto.displayName) || null;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive !== false;
    if (Object.keys(patch).length) {
      await this.accounts.update({ id: Number(a.id) }, patch);
    }
    if (dto.displayName !== undefined) {
      await this.users.update(
        { id: a.userId },
        { displayName: text(dto.displayName) || undefined },
      );
    }
    if (dto.username !== undefined) {
      await this.renameLogin(a, fold(dto.username));
    }
    return this.view(Number(a.id), dto.branchId);
  }

  /** A corrected username — the same rules as at creation; the internal e-mail follows. */
  private async renameLogin(a: SchoolStudentAccount, username: string) {
    if (!username) throw new BadRequestException('Give the login a username.');
    const user = await this.users.findOne({ where: { id: a.userId } });
    if (!user || user.authMode !== 'MANUAL') {
      throw new ForbiddenException(
        'Only a login the office created can have its username changed here.',
      );
    }
    if (fold(user.posUsername) === username) return;
    const internalEmail = await this.assertUsernameFree(username, user.id);
    user.posUsername = username;
    if (String(user.email ?? '').startsWith(STUDENT_INTERNAL_EMAIL_PREFIX)) {
      user.email = internalEmail;
    }
    await this.users.save(user);
  }

  async resetPassword(id: number, dto: ResetSchoolStudentAccountPasswordDto) {
    const a = await this.findOnBranch(id, dto.branchId);
    const user = await this.users.findOne({ where: { id: a.userId } });
    if (!user || user.authMode !== 'MANUAL') {
      throw new ForbiddenException(
        'Only a login the office created can have its password reset here.',
      );
    }
    user.password = await bcrypt.hash(dto.password, 10);
    await this.users.save(user);
    await this.accounts.update(
      { id: Number(a.id) },
      { passwordIssuedAt: new Date() },
    );
    return { status: 'PASSWORD_RESET', id: Number(a.id) };
  }

  /** Remove the login; the user row goes too when no other school holds it, so the username is free again. */
  async remove(id: number, branchId: number) {
    const a = await this.findOnBranch(id, branchId);
    await this.accounts.delete({ id: Number(a.id) });
    const elsewhere = await this.accounts.count({
      where: { userId: a.userId },
    });
    let userRemoved = false;
    if (!elsewhere) {
      const user = await this.users.findOne({ where: { id: a.userId } });
      if (user && user.authMode === 'MANUAL') {
        await this.users.remove(user);
        userRemoved = true;
      }
    }
    return { status: 'REMOVED', id: Number(a.id), userRemoved };
  }

  // ── portal ───────────────────────────────────────────────────────────────

  /**
   * The accounts this user may sign in with: switched on, at an open branch,
   * and — unless `includeLeft` — for a pupil still ON THE ROLL. Owner
   * 2026-10-18: a pupil who leaves (marked left, withdrawn, record gone)
   * loses their own login at once, and gets it back the moment the office
   * re-activates them — nothing stored to switch off or forget to switch on.
   * Every portal door (sign-in, `me`, the record, change-password) reads
   * this, so a session already open closes on its next read too.
   */
  private async activeAccounts(
    userId: number,
    { includeLeft = false }: { includeLeft?: boolean } = {},
  ) {
    if (!userId) return [];
    const rows = await this.accounts.find({
      where: { userId, isActive: true },
      order: { id: 'ASC' },
    });
    if (!rows.length) return [];
    const branches = await this.branches.find({
      where: { id: In(rows.map((r) => r.branchId)), isActive: true },
    });
    const byId = new Map(branches.map((b) => [Number(b.id), b]));
    const open = rows
      .filter((r) => byId.has(Number(r.branchId)))
      .map((r) => ({ account: r, branch: byId.get(Number(r.branchId)) }));
    if (includeLeft || !open.length) return open;
    const folios = await this.foliosById(
      open.map((h) => Number(h.account.folioId)),
    );
    return open.filter(({ account }) => {
      const row = folios.get(Number(account.folioId));
      return (
        Boolean(row) &&
        Number(row.branchId) === Number(account.branchId) &&
        pupilOf(row).status === 'ACTIVE'
      );
    });
  }

  /**
   * A pupil signs in with the same username/password check as everyone
   * else, and is then let in only when at least one school holds an active
   * student account for that user. A staff or a parent's login answers 403
   * here, not a pupil's page with nothing on it.
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
    const held = await this.activeAccounts(Number(tokens.user.id));
    if (!held.length) {
      const left = await this.activeAccounts(Number(tokens.user.id), {
        includeLeft: true,
      });
      if (left.length) {
        throw new ForbiddenException({
          error: {
            code: 'SCHOOL_STUDENT_LEFT',
            message:
              'You are no longer on this school’s roll, so this login is closed. If you have come back to the school, ask the office.',
          },
        });
      }
      const everHeld = await this.accounts.count({
        where: { userId: Number(tokens.user.id) },
      });
      throw new ForbiddenException({
        error: everHeld
          ? {
              code: 'SCHOOL_STUDENT_SWITCHED_OFF',
              message:
                'The school office has switched this login off. Ask the office to switch it on again.',
            }
          : {
              code: 'SCHOOL_STUDENT_ACCESS_DENIED',
              message:
                'This login is not a student’s login at any school. Ask the school office for yours.',
            },
      });
    }
    await this.accounts.update(
      { id: In(held.map((h) => Number(h.account.id))) },
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
    const held = await this.activeAccounts(userId);
    if (!held.length) {
      // A session opened before the pupil left closes here, told why.
      const left = await this.activeAccounts(userId, { includeLeft: true });
      if (left.length) {
        throw new ForbiddenException({
          error: {
            code: 'SCHOOL_STUDENT_LEFT',
            message:
              'You are no longer on this school’s roll, so this login is closed. If you have come back to the school, ask the office.',
          },
        });
      }
      throw new ForbiddenException({
        error: {
          code: 'SCHOOL_STUDENT_ACCESS_DENIED',
          message: 'This login is not a student’s login at any school.',
        },
      });
    }
    const user = await this.users.findOne({ where: { id: userId } });
    const folios = await this.foliosById(
      held.map((h) => Number(h.account.folioId)),
    );
    const classesByBranch = new Map<number, Set<string>>();
    for (const { account, branch } of held) {
      const set = classesByBranch.get(Number(branch.id)) ?? new Set<string>();
      const row = folios.get(Number(account.folioId));
      const code = row ? fold(pupilOf(row).classCode) : '';
      if (code) set.add(code);
      classesByBranch.set(Number(branch.id), set);
    }
    const usingIssuedPassword = held.every(({ account }) => {
      const issued = account.passwordIssuedAt
        ? new Date(account.passwordIssuedAt).getTime()
        : 0;
      const changed = account.passwordChangedAt
        ? new Date(account.passwordChangedAt).getTime()
        : 0;
      return !changed || changed < issued;
    });
    // Today's register mark and the homework falling due, per school, in
    // one read each — what the pupil's home flags first.
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
    const firstName = held.find((h) => h.account.displayName)?.account
      .displayName;
    return {
      user: {
        id: userId,
        username: user?.posUsername ?? null,
        displayName: firstName ?? user?.displayName ?? null,
        canChangePassword: user?.authMode === 'MANUAL',
        usingIssuedPassword: user?.authMode === 'MANUAL' && usingIssuedPassword,
      },
      notices: await this.guardians.noticesFor(held, classesByBranch),
      schools: held.map(({ account, branch }) => {
        const folioId = Number(account.folioId);
        const row = folios.get(folioId);
        const summary = this.pupilSummary(row, folioId);
        const code = row ? fold(pupilOf(row).classCode) : '';
        return {
          ...this.guardians.schoolView(branch),
          today: localDayIn(schoolTimeZone(branch)),
          account: { id: Number(account.id) },
          pupil: {
            ...summary,
            todayMark:
              todayByBranch.get(Number(branch.id))?.get(String(folioId)) ??
              null,
            homeworkDue: code
              ? (dueByBranch.get(Number(branch.id))?.get(code) ?? 0)
              : 0,
          },
        };
      }),
    };
  }

  /** The account that lets THIS user read THIS record — or nothing. */
  private async accountFor(userId: number, folioId: number) {
    const held = await this.activeAccounts(userId);
    return (
      held.find((h) => Number(h.account.folioId) === Number(folioId)) ?? null
    );
  }

  /** The pupil's own record in full — only the one their login names. */
  async pupil(userId: number, folioId: number) {
    const held = await this.accountFor(userId, folioId);
    if (!held) throw new NotFoundException('No such record on this login.');
    const branchId = Number(held.branch.id);
    const row = await this.carts.findOne({ where: { id: folioId, branchId } });
    if (!row) throw new NotFoundException('No such record on this login.');
    return this.guardians.pupilDossier(held.branch, row);
  }

  async changePassword(userId: number, dto: StudentPortalChangePasswordDto) {
    const held = await this.activeAccounts(userId);
    if (!held.length) {
      throw new ForbiddenException('This login is not a student’s login.');
    }
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.password || user.authMode !== 'MANUAL') {
      throw new ForbiddenException(
        'This login’s password is managed elsewhere.',
      );
    }
    const ok = await bcrypt.compare(dto.currentPassword, user.password);
    if (!ok) {
      // 400, not 401: the pupil IS signed in — a 401 reads to the client as
      // an aged-out token and signs them out for a typo.
      throw new BadRequestException({
        error: {
          code: 'SCHOOL_STUDENT_WRONG_PASSWORD',
          message: 'The current password is not right.',
        },
      });
    }
    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.users.save(user);
    await this.accounts.update({ userId }, { passwordChangedAt: new Date() });
    return { status: 'PASSWORD_CHANGED' };
  }
}
