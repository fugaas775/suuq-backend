import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  PosSuspendedCart,
  PosSuspendedCartStatus,
} from '../pos-sync/entities/pos-suspended-cart.entity';
import { actorNameFromEmail } from '../school/school-actor-name.util';
import { ScopeActor } from '../school/school-class-scope.service';
import { User } from '../users/entities/user.entity';
import { SchoolGuardianPupil } from './entities/school-guardian-pupil.entity';
import { SchoolGuardian } from './entities/school-guardian.entity';
import { SchoolMessageThread } from './entities/school-message-thread.entity';
import { SchoolMessage } from './entities/school-message.entity';
import { isPupilRecord, pupilOf } from './school-guardian.util';
import {
  SchoolStaffReachService,
  StaffReach,
} from './school-staff-reach.service';

const text = (v: unknown) => String(v ?? '').trim();
const fold = (v: unknown) => text(v).toLowerCase();
const preview = (body: string) => text(body).replace(/\s+/g, ' ').slice(0, 200);

const MESSAGES_PER_THREAD = 200;
const THREADS_PER_LIST = 300;

/**
 * Messages between a family and the school, one thread per child.
 *
 * Staff side: whoever REACHES the child's class (the class teacher, the
 * subject teachers off the timetable, the office) reads and answers the
 * thread and may open one. Family side: the guardian-portal routes hand the
 * service the guardianship the link rows resolved — never a branch id or a
 * thread id off the wire on its own. Nothing is edited or deleted: what was
 * said to a family stands, and so does what they said.
 */
@Injectable()
export class SchoolMessageService {
  constructor(
    @InjectRepository(SchoolMessageThread)
    private readonly threads: Repository<SchoolMessageThread>,
    @InjectRepository(SchoolMessage)
    private readonly messages: Repository<SchoolMessage>,
    @InjectRepository(SchoolGuardian)
    private readonly guardians: Repository<SchoolGuardian>,
    @InjectRepository(SchoolGuardianPupil)
    private readonly links: Repository<SchoolGuardianPupil>,
    @InjectRepository(PosSuspendedCart)
    private readonly carts: Repository<PosSuspendedCart>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly reachSvc: SchoolStaffReachService,
  ) {}

  // ── shared ───────────────────────────────────────────────────────────────

  private threadView(
    t: SchoolMessageThread,
    guardianName?: string | null,
    guardianRemoved = false,
  ) {
    return {
      id: Number(t.id),
      branchId: t.branchId,
      folioId: Number(t.folioId),
      guardianId: Number(t.guardianId),
      guardianName: guardianName ?? null,
      /** The family's login was removed since; the conversation stands as a record. */
      guardianRemoved,
      pupilName: t.pupilName ?? null,
      classCode: t.classCode ?? null,
      lastMessageAt: t.lastMessageAt ?? null,
      lastPreview: t.lastPreview ?? null,
      lastSenderKind: t.lastSenderKind ?? null,
      guardianUnread: Number(t.guardianUnread) || 0,
      staffUnread: Number(t.staffUnread) || 0,
      createdAt: t.createdAt,
    };
  }

  private messageView(m: SchoolMessage) {
    return {
      id: Number(m.id),
      threadId: Number(m.threadId),
      senderKind: m.senderKind,
      senderName: m.senderName ?? null,
      body: m.body,
      createdAt: m.createdAt,
    };
  }

  /**
   * The NEWEST messages of a thread, oldest first. Taken from the end: read
   * from the start, a thread past the cap went on storing every new message
   * and showing neither side any of them — the sender's own included.
   */
  private async messagesOf(threadId: number) {
    const rows = await this.messages.find({
      where: { threadId },
      order: { id: 'DESC' },
      take: MESSAGES_PER_THREAD,
    });
    return rows
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((m) => this.messageView(m));
  }

  /**
   * The name a family reads over a message from the school. The staff
   * register's when the login is joined to it; else the account's own display
   * name; never a sign-in address (see actorNameFromEmail).
   */
  private async staffSender(
    reach: StaffReach,
    actor: ScopeActor,
  ): Promise<string | null> {
    if (reach.employee?.fullName) return reach.employee.fullName;
    // `reach.name` is the staff register's name when one is joined, and
    // otherwise what could be made of the sign-in address. Only the second
    // is worth improving on.
    const name = text(reach.name);
    const fromAddress = actorNameFromEmail(actor?.email);
    if (name && name !== fromAddress && !/^user \d+$/.test(name)) return name;
    const user =
      actor?.id != null
        ? await this.users.findOne({ where: { id: Number(actor.id) } })
        : null;
    return text(user?.displayName) || name || null;
  }

  private async pupilRow(branchId: number, folioId: number) {
    const row = await this.carts.findOne({ where: { id: folioId, branchId } });
    if (
      !row ||
      String(row.status).toUpperCase() !== PosSuspendedCartStatus.SUSPENDED ||
      !isPupilRecord(row)
    ) {
      throw new NotFoundException({
        code: 'SCHOOL_PUPIL_NOT_FOUND',
        message: 'No such pupil on this school.',
      });
    }
    return row;
  }

  /** Find or create the (pupil, guardian) thread, class refreshed off the folio. */
  private async threadFor(
    branchId: number,
    folio: PosSuspendedCart,
    guardianId: number,
  ): Promise<SchoolMessageThread> {
    const p = pupilOf(folio);
    let row = await this.threads.findOne({
      where: { branchId, folioId: Number(folio.id), guardianId },
    });
    if (!row) {
      row = this.threads.create({
        branchId,
        folioId: Number(folio.id),
        guardianId,
        pupilName: p.name || null,
        classCode: fold(p.classCode) || null,
        lastMessageAt: null,
        lastPreview: null,
        lastSenderKind: null,
        guardianUnread: 0,
        staffUnread: 0,
      });
      try {
        row = await this.threads.save(row);
      } catch (err) {
        // Two first messages about the same child crossed (the family and a
        // teacher, or two teachers): the thread is unique per child and
        // guardian, so the loser reads the winner's row and posts on it —
        // its message used to be dropped with a "that was already saved".
        if ((err as { code?: string })?.code !== '23505') throw err;
        const existing = await this.threads.findOne({
          where: { branchId, folioId: Number(folio.id), guardianId },
        });
        if (!existing) throw err;
        row = existing;
      }
    } else {
      row.pupilName = p.name || row.pupilName;
      row.classCode = fold(p.classCode) || row.classCode;
    }
    return row;
  }

  private async post(
    thread: SchoolMessageThread,
    senderKind: 'GUARDIAN' | 'STAFF',
    senderUserId: number | null,
    senderName: string | null,
    body: string,
  ) {
    const clean = text(body).slice(0, 4000);
    const message = await this.messages.save(
      this.messages.create({
        threadId: Number(thread.id),
        branchId: thread.branchId,
        senderKind,
        senderUserId,
        senderName: senderName ? senderName.slice(0, 160) : null,
        body: clean,
      }),
    );
    thread.lastMessageAt = message.createdAt ?? new Date();
    thread.lastPreview = preview(clean);
    thread.lastSenderKind = senderKind;
    if (senderKind === 'STAFF') {
      thread.guardianUnread = (Number(thread.guardianUnread) || 0) + 1;
      thread.staffUnread = 0;
    } else {
      thread.staffUnread = (Number(thread.staffUnread) || 0) + 1;
      thread.guardianUnread = 0;
    }
    await this.threads.save(thread);
    return message;
  }

  private async guardianNames(guardianIds: number[]) {
    const ids = [...new Set(guardianIds.map(Number).filter((n) => n > 0))];
    if (!ids.length) return new Map<number, string>();
    const rows = await this.guardians.find({ where: { id: In(ids) } });
    const users = await this.users.find({
      where: { id: In(rows.map((g) => g.userId)) },
    });
    const byUser = new Map(users.map((u) => [Number(u.id), u]));
    return new Map(
      rows.map((g) => {
        const u = byUser.get(Number(g.userId));
        return [
          Number(g.id),
          g.displayName || u?.displayName || u?.posUsername || '',
        ];
      }),
    );
  }

  // ── staff ────────────────────────────────────────────────────────────────

  private assertReach(reach: StaffReach, classCode: unknown) {
    if (this.reachSvc.reachesClass(reach, classCode)) return;
    throw new ForbiddenException({
      code: 'SCHOOL_CLASS_OUT_OF_SCOPE',
      message: reach.classes?.size
        ? `${text(classCode) || 'This class'} is not one of your classes (${[...reach.classes].join(', ')}).`
        : 'No class is assigned to you yet — the office assigns your classes and timetable in Branch Staff.',
    });
  }

  /**
   * The threads this person may read, newest first, plus which pupils in
   * their reach have a family login (so a teacher can start a conversation
   * and knows whom they cannot reach this way yet).
   */
  async listThreads(branchId: number, actor: ScopeActor) {
    const reach = await this.reachSvc.resolve(branchId, actor);
    const rows = await this.threads.find({
      where: { branchId },
      order: { lastMessageAt: 'DESC', id: 'DESC' },
      take: THREADS_PER_LIST,
    });
    // The class is refreshed off the folio so a transferred child's thread
    // follows the child, and so the reach check reads the class as it stands.
    const folios = rows.length
      ? await this.carts.find({
          where: { id: In(rows.map((r) => Number(r.folioId))) },
        })
      : [];
    const folioById = new Map(folios.map((f) => [Number(f.id), f]));
    const visible = rows.filter((t) => {
      const f = folioById.get(Number(t.folioId));
      const code = f ? fold(pupilOf(f).classCode) : fold(t.classCode);
      return this.reachSvc.reachesClass(reach, code);
    });
    const names = await this.guardianNames(
      visible.map((t) => Number(t.guardianId)),
    );

    // Families with a login, in reach.
    const guardians = await this.guardians.find({
      where: { branchId, isActive: true },
    });
    const links = guardians.length
      ? await this.links.find({
          where: { guardianId: In(guardians.map((g) => Number(g.id))) },
        })
      : [];
    const linkedFolios = [...new Set(links.map((l) => Number(l.folioId)))];
    const linkedRows = linkedFolios.length
      ? await this.carts.find({ where: { id: In(linkedFolios), branchId } })
      : [];
    const guardianById = new Map(guardians.map((g) => [Number(g.id), g]));
    const reachable = linkedRows
      .filter(
        (f) =>
          String(f.status).toUpperCase() === PosSuspendedCartStatus.SUSPENDED &&
          isPupilRecord(f),
      )
      .map((f) => pupilOf(f))
      .filter(
        (p) =>
          p.status === 'ACTIVE' &&
          this.reachSvc.reachesClass(reach, p.classCode),
      )
      .map((p) => ({
        folioId: p.folioId,
        name: p.name,
        classCode: p.classCode,
        guardians: links
          .filter((l) => Number(l.folioId) === p.folioId)
          .map((l) => guardianById.get(Number(l.guardianId)))
          .filter(Boolean)
          .map((g) => ({
            id: Number(g.id),
            displayName: g.displayName ?? null,
          })),
      }))
      .sort(
        (a, b) =>
          a.classCode.localeCompare(b.classCode) ||
          a.name.localeCompare(b.name),
      );

    return {
      employee: reach.employee,
      head: reach.head,
      reach: reach.head ? null : [...(reach.classes ?? [])].sort(),
      unread: visible.reduce((n, t) => n + (Number(t.staffUnread) || 0), 0),
      items: visible.map((t) => {
        const f = folioById.get(Number(t.folioId));
        const view = this.threadView(
          t,
          names.get(Number(t.guardianId)),
          !names.has(Number(t.guardianId)),
        );
        if (f) {
          const p = pupilOf(f);
          view.pupilName = p.name || view.pupilName;
          view.classCode = fold(p.classCode) || view.classCode;
        }
        return view;
      }),
      reachable,
    };
  }

  /** One thread with its messages; opening it clears the staff side's unread. */
  async getThread(id: number, branchId: number, actor: ScopeActor) {
    const thread = await this.threads.findOne({ where: { id, branchId } });
    if (!thread)
      throw new NotFoundException('Conversation not found on this school.');
    const reach = await this.reachSvc.resolve(branchId, actor);
    const folio = await this.carts.findOne({
      where: { id: Number(thread.folioId), branchId },
    });
    const code = folio
      ? fold(pupilOf(folio).classCode)
      : fold(thread.classCode);
    this.assertReach(reach, code);
    if (Number(thread.staffUnread) > 0) {
      thread.staffUnread = 0;
      await this.threads.save(thread);
    }
    const names = await this.guardianNames([Number(thread.guardianId)]);
    return {
      thread: this.threadView(
        thread,
        names.get(Number(thread.guardianId)),
        !names.has(Number(thread.guardianId)),
      ),
      messages: await this.messagesOf(Number(thread.id)),
      me: { name: reach.name, employee: reach.employee },
    };
  }

  /**
   * The school writes first, to the family of one pupil. A pupil whose
   * family has no login yet cannot be written to — the office gives them
   * one on the parents' desk. One thread per guardian linked to the child.
   */
  async openThread(
    dto: { branchId: number; folioId: number; body: string },
    actor: ScopeActor,
  ) {
    const folio = await this.pupilRow(dto.branchId, dto.folioId);
    const p = pupilOf(folio);
    const reach = await this.reachSvc.resolve(dto.branchId, actor);
    this.assertReach(reach, p.classCode);
    const links = await this.links.find({
      where: { folioId: Number(folio.id) },
    });
    const guardians = links.length
      ? await this.guardians.find({
          where: {
            id: In(links.map((l) => Number(l.guardianId))),
            branchId: dto.branchId,
            isActive: true,
          },
        })
      : [];
    if (!guardians.length) {
      throw new ConflictException({
        code: 'SCHOOL_NO_PARENT_LOGIN',
        message: `${p.name || 'This pupil'}’s family has no parents’ login yet. The office gives them one under Students → Parents’ logins.`,
      });
    }
    const sender = await this.staffSender(reach, actor);
    let first: SchoolMessageThread | null = null;
    for (const g of guardians) {
      const thread = await this.threadFor(dto.branchId, folio, Number(g.id));
      await this.post(thread, 'STAFF', actor?.id ?? null, sender, dto.body);
      if (!first) first = thread;
    }
    return this.getThread(Number(first.id), dto.branchId, actor);
  }

  async reply(
    id: number,
    dto: { branchId: number; body: string },
    actor: ScopeActor,
  ) {
    const thread = await this.threads.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!thread)
      throw new NotFoundException('Conversation not found on this school.');
    const reach = await this.reachSvc.resolve(dto.branchId, actor);
    const folio = await this.carts.findOne({
      where: { id: Number(thread.folioId), branchId: dto.branchId },
    });
    if (folio) {
      const p = pupilOf(folio);
      this.assertReach(reach, p.classCode);
      thread.pupilName = p.name || thread.pupilName;
      thread.classCode = fold(p.classCode) || thread.classCode;
    } else {
      this.assertReach(reach, thread.classCode);
    }
    // A reply nobody can read is worse than a refusal: the teacher is told
    // "Sent", the family — switched off, removed, or no longer linked to the
    // child — never sees it, and the unread count climbs for good.
    const [guardian, link] = await Promise.all([
      this.guardians.findOne({
        where: { id: Number(thread.guardianId), branchId: dto.branchId },
      }),
      this.links.findOne({
        where: {
          guardianId: Number(thread.guardianId),
          folioId: Number(thread.folioId),
        },
      }),
    ]);
    if (!guardian || guardian.isActive === false || !link) {
      throw new ConflictException({
        code: 'SCHOOL_NO_PARENT_LOGIN',
        message: `${thread.pupilName || 'This pupil'}’s family can no longer read this conversation — their parents’ login was switched off, removed, or no longer covers this child. The office restores it under Students → Parents’ logins.`,
      });
    }
    await this.post(
      thread,
      'STAFF',
      actor?.id ?? null,
      await this.staffSender(reach, actor),
      dto.body,
    );
    return this.getThread(Number(thread.id), dto.branchId, actor);
  }

  // ── the family ───────────────────────────────────────────────────────────

  /** The family's thread about one child, unread cleared; null when nothing was ever said. */
  async guardianThread(branchId: number, guardianId: number, folioId: number) {
    const thread = await this.threads.findOne({
      where: { branchId, guardianId, folioId },
    });
    if (!thread) return { thread: null, messages: [] };
    if (Number(thread.guardianUnread) > 0) {
      thread.guardianUnread = 0;
      await this.threads.save(thread);
    }
    return {
      thread: this.threadView(thread),
      messages: await this.messagesOf(Number(thread.id)),
    };
  }

  async guardianSend(
    branchId: number,
    guardian: { id: number; userId: number; displayName?: string | null },
    folio: PosSuspendedCart,
    senderName: string | null,
    body: string,
  ) {
    const thread = await this.threadFor(branchId, folio, Number(guardian.id));
    await this.post(
      thread,
      'GUARDIAN',
      Number(guardian.userId) || null,
      senderName,
      body,
    );
    return {
      thread: this.threadView(thread),
      messages: await this.messagesOf(Number(thread.id)),
    };
  }

  /** folioId → messages from the school the family has not opened, for these guardianships. */
  async unreadByFolio(guardianIds: number[]) {
    const ids = [...new Set(guardianIds.map(Number).filter((n) => n > 0))];
    const out = new Map<number, number>();
    if (!ids.length) return out;
    const rows = await this.threads.find({ where: { guardianId: In(ids) } });
    for (const t of rows) {
      const n = Number(t.guardianUnread) || 0;
      if (n > 0)
        out.set(Number(t.folioId), (out.get(Number(t.folioId)) ?? 0) + n);
    }
    return out;
  }
}
