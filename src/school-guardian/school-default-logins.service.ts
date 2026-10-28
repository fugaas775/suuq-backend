import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { PosSuspendedCartStatus } from '../pos-sync/entities/pos-suspended-cart.entity';
import { User } from '../users/entities/user.entity';
import {
  SchoolDefaultLoginKind,
  SchoolDefaultLoginMark,
} from './entities/school-default-login-mark.entity';
import { SchoolGuardianPupil } from './entities/school-guardian-pupil.entity';
import { SchoolGuardian } from './entities/school-guardian.entity';
import { SchoolStudentAccount } from './entities/school-student-account.entity';
import { SchoolGuardianService } from './school-guardian.service';
import { SchoolStudentAccountService } from './school-student-account.service';
import { guardianUsernameFromPhone, pupilOf } from './school-guardian.util';

/** The one password the office issues (owner 2026-10-17) — the desks' ISSUED_PASSWORD. */
export const DEFAULT_ISSUED_PASSWORD = '12345678';

export type DefaultLoginsResult = {
  branchId: number;
  studentsCreated: number;
  familiesCreated: number;
  childrenLinked: number;
};

/**
 * Every SCHOOL pupil gets its logins the way SMAQ's were made (owner
 * 2026-10-28: "Create Parent logins and Students logins like SMAQ School by
 * default"):
 *
 * - STUDENT: Grade 6 and up (the desk's own gate), username = the admission
 *   number folded (`smaq-0287`), else first.last — the bulk desk's choice.
 * - PARENT: one login per guardian phone, username = the phone; siblings on
 *   the same number share it. A pupil with no phone on the roll waits until
 *   the office adds one. A number that already signs in as a family at THIS
 *   school gets the child ticked on; one that signs in as anything else
 *   (staff, a pupil, another school's family) is left to the office.
 * - Password 12345678 for both, as the desks issue.
 *
 * Only live (ACTIVE) pupils, and only records with no mark of that kind: a
 * mark is written the first time a record holds the login, so a login the
 * office removes — or a child it unticks — is not handed back.
 *
 * A sweep every five minutes on the first pm2 worker; a branch whose roll has
 * not changed since its last clean sweep is skipped.
 */
@Injectable()
export class SchoolDefaultLoginsService {
  private readonly logger = new Logger(SchoolDefaultLoginsService.name);
  private running = false;
  private readonly sweptAt = new Map<number, string>();

  constructor(
    @InjectRepository(Branch)
    private readonly branches: Repository<Branch>,
    @InjectRepository(SchoolDefaultLoginMark)
    private readonly marks: Repository<SchoolDefaultLoginMark>,
    @InjectRepository(SchoolStudentAccount)
    private readonly accounts: Repository<SchoolStudentAccount>,
    @InjectRepository(SchoolGuardian)
    private readonly guardianRows: Repository<SchoolGuardian>,
    @InjectRepository(SchoolGuardianPupil)
    private readonly guardianPupils: Repository<SchoolGuardianPupil>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly guardians: SchoolGuardianService,
    private readonly students: SchoolStudentAccountService,
  ) {}

  // pm2 runs four workers; only the first runs the job.
  private shouldRunOnCurrentInstance(): boolean {
    const instanceId =
      process.env.INSTANCE_ID ?? process.env.NODE_APP_INSTANCE ?? null;
    return !instanceId || instanceId === '0';
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick(): Promise<void> {
    if (!this.shouldRunOnCurrentInstance() || this.running) return;
    this.running = true;
    try {
      const schools = await this.branches
        .createQueryBuilder('b')
        .select('b.id', 'id')
        .where('b."isActive" = true')
        .andWhere(`upper(coalesce(b."serviceFormat", '')) = 'SCHOOL'`)
        .getRawMany<{ id: number }>();
      for (const { id } of schools) {
        const branchId = Number(id);
        try {
          const signature = await this.rollSignature(branchId);
          if (this.sweptAt.get(branchId) === signature) continue;
          const result = await this.ensureForBranch(branchId);
          if (
            result.studentsCreated ||
            result.familiesCreated ||
            result.childrenLinked
          ) {
            this.logger.log(
              `School ${branchId}: ${result.studentsCreated} student logins, ${result.familiesCreated} parent logins, ${result.childrenLinked} children added to a family's login`,
            );
          }
          this.sweptAt.set(branchId, signature);
        } catch (error) {
          this.sweptAt.delete(branchId);
          this.logger.error(
            `Default school logins failed for branch ${branchId}: ${(error as Error)?.message || error}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Changes whenever a pupil record is added, edited, moved or leaves. */
  private async rollSignature(branchId: number): Promise<string> {
    const row = await this.guardianPupils.manager
      .createQueryBuilder()
      .select('count(*)', 'n')
      .addSelect('max(c."updatedAt")', 'at')
      .from('pos_suspended_carts', 'c')
      .where('c."branchId" = :branchId', { branchId })
      .andWhere('c.status = :status', {
        status: PosSuspendedCartStatus.SUSPENDED,
      })
      .andWhere(
        `upper(coalesce(c."cartSnapshot" ->> 'serviceFormat', '')) = 'SCHOOL'`,
      )
      .getRawOne<{ n: string; at: Date | null }>();
    return `${row?.n ?? 0}@${row?.at ? new Date(row.at).toISOString() : ''}`;
  }

  private async markedFolios(
    branchId: number,
    kind: SchoolDefaultLoginKind,
  ): Promise<Set<number>> {
    const rows = await this.marks.find({
      where: { branchId, kind },
      select: { folioId: true },
    });
    return new Set(rows.map((r) => Number(r.folioId)));
  }

  private async mark(
    branchId: number,
    kind: SchoolDefaultLoginKind,
    folioIds: number[],
  ) {
    if (!folioIds.length) return;
    await this.marks
      .createQueryBuilder()
      .insert()
      .values(folioIds.map((folioId) => ({ branchId, folioId, kind })))
      .orIgnore()
      .execute();
  }

  /** The records on this school that hold a login of that kind today. */
  private async heldFolios(
    branchId: number,
    kind: SchoolDefaultLoginKind,
  ): Promise<number[]> {
    if (kind === 'STUDENT') {
      const rows = await this.accounts.find({
        where: { branchId },
        select: { folioId: true },
      });
      return rows.map((r) => Number(r.folioId));
    }
    const families = await this.guardianRows.find({
      where: { branchId },
      select: { id: true },
    });
    if (!families.length) return [];
    const links = await this.guardianPupils.find({
      where: { guardianId: In(families.map((g) => Number(g.id))) },
      select: { folioId: true },
    });
    return links.map((l) => Number(l.folioId));
  }

  async ensureForBranch(branchId: number): Promise<DefaultLoginsResult> {
    const result: DefaultLoginsResult = {
      branchId,
      studentsCreated: 0,
      familiesCreated: 0,
      childrenLinked: 0,
    };
    // Whatever holds a login today — made by the office or by us — counts
    // as given, before anything new is considered.
    await this.mark(
      branchId,
      'STUDENT',
      await this.heldFolios(branchId, 'STUDENT'),
    );
    await this.mark(
      branchId,
      'PARENT',
      await this.heldFolios(branchId, 'PARENT'),
    );

    const live = (await this.guardians.pupilRecords(branchId))
      .map((row) => pupilOf(row))
      .filter((p) => p.status === 'ACTIVE');
    if (!live.length) return result;

    // Students — createMany applies the grade gate and the username rule
    // and skips whoever it cannot name.
    const studentDone = await this.markedFolios(branchId, 'STUDENT');
    const studentWanted = live
      .map((p) => p.folioId)
      .filter((id) => !studentDone.has(id));
    if (studentWanted.length) {
      const { created } = await this.students.createMany(
        {
          branchId,
          folioIds: studentWanted,
          password: DEFAULT_ISSUED_PASSWORD,
        },
        {},
      );
      result.studentsCreated = created.length;
      await this.mark(
        branchId,
        'STUDENT',
        created.map((c) => c.folioId),
      );
    }

    // Parents — one login per phone.
    const parentDone = await this.markedFolios(branchId, 'PARENT');
    const families = new Map<
      string,
      { phone: string; guardianName: string; folioIds: number[] }
    >();
    for (const p of live) {
      if (parentDone.has(p.folioId)) continue;
      const username = guardianUsernameFromPhone(p.guardianPhone);
      if (!username) continue;
      if (!families.has(username)) {
        families.set(username, {
          phone: p.guardianPhone,
          guardianName: p.guardianName,
          folioIds: [],
        });
      }
      const family = families.get(username);
      if (!family.guardianName && p.guardianName)
        family.guardianName = p.guardianName;
      family.folioIds.push(p.folioId);
    }
    for (const [username, family] of families) {
      try {
        const held = await this.users.findOne({
          where: { posUsername: username },
          select: { id: true },
        });
        if (!held) {
          await this.guardians.create(
            {
              branchId,
              phone: family.phone,
              displayName: family.guardianName || undefined,
              password: DEFAULT_ISSUED_PASSWORD,
              folioIds: family.folioIds,
            },
            {},
          );
          result.familiesCreated += 1;
        } else {
          const login = await this.guardianRows.findOne({
            where: { branchId, userId: Number(held.id) },
          });
          // Not a family of this school — the office decides.
          if (!login) continue;
          const have = await this.guardianPupils.find({
            where: { guardianId: Number(login.id) },
            select: { folioId: true },
          });
          await this.guardians.update(Number(login.id), {
            branchId,
            folioIds: [
              ...have.map((l) => Number(l.folioId)),
              ...family.folioIds,
            ],
          });
          result.childrenLinked += family.folioIds.length;
        }
        await this.mark(branchId, 'PARENT', family.folioIds);
      } catch (error) {
        this.logger.warn(
          `Default parent login for ${username} at branch ${branchId} not made: ${(error as Error)?.message || error}`,
        );
      }
    }
    return result;
  }
}
