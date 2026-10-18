import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  PosRegisterSession,
  PosRegisterSessionStatus,
} from './entities/pos-register-session.entity';
import { PosRegisterReportService } from './pos-register-report.service';
import {
  isWithinOpeningHours,
  lastScheduledClose,
  lastScheduledOpen,
} from './register-schedule';

/**
 * Opens and closes the registers of every branch that set a schedule.
 *
 * OPEN (owner 2026-10-18: "Every day, it must close the time I set also it
 * must open the time I set"): from the branch's opening time, once a day,
 * a branch with no register open — and none opened since that opening time —
 * gets one, on the till id the branch already uses, so the cashiers' tills
 * join it rather than starting their own. A register a member of staff
 * closed by hand during the day is not reopened until the next opening
 * time. Nobody counted a float, so none is recorded.
 *
 * CLOSE: closes the registers of every branch that set a closing time. Each minute
 * it closes any session still open that was opened before the branch's most
 * recent closing time — so a minute missed to a restart is caught on the
 * next one, and a session a manager opened after closing runs on until the
 * following night's.
 *
 * Nobody counted the drawer, so no closing cash is recorded; the session
 * says it was closed on schedule, and the owner's close report is built from
 * the books, as for any close the till did not report.
 */
@Injectable()
export class PosRegisterScheduleService {
  private readonly logger = new Logger(PosRegisterScheduleService.name);
  private running = false;

  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(PosRegisterSession)
    private readonly registerSessionsRepository: Repository<PosRegisterSession>,
    private readonly reportService: PosRegisterReportService,
  ) {}

  // pm2 runs four workers; only the first runs the job.
  private shouldRunOnCurrentInstance(): boolean {
    const instanceId =
      process.env.INSTANCE_ID ?? process.env.NODE_APP_INSTANCE ?? null;
    return !instanceId || instanceId === '0';
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (!this.shouldRunOnCurrentInstance() || this.running) return;
    this.running = true;
    try {
      await this.closeDueSessions();
    } catch (error) {
      this.logger.error(
        `Scheduled register close failed: ${(error as Error)?.message || error}`,
      );
    }
    try {
      await this.openDueSessions();
    } catch (error) {
      this.logger.error(
        `Scheduled register open failed: ${(error as Error)?.message || error}`,
      );
    } finally {
      this.running = false;
    }
  }

  async closeDueSessions(now: Date = new Date()): Promise<number[]> {
    const branches = await this.branchesRepository.find({
      where: { registerClosesAt: Not(IsNull()), isActive: true },
      select: {
        id: true,
        name: true,
        registerClosesAt: true,
        serviceFormat: true,
      },
    });

    const closed: number[] = [];
    for (const branch of branches) {
      const closeAt = lastScheduledClose(branch.registerClosesAt, now);
      if (!closeAt) continue;
      const due = await this.registerSessionsRepository.find({
        where: {
          branchId: branch.id,
          status: PosRegisterSessionStatus.OPEN,
          openedAt: LessThan(closeAt),
        },
      });

      for (const session of due) {
        // Claimed by the status flip itself: a till closing the same session
        // in the same moment wins or loses cleanly, and only the winner
        // sends the owner a report.
        const metadata = {
          ...(session.metadata || {}),
          scheduledClose: {
            closesAt: branch.registerClosesAt,
            scheduledFor: closeAt.toISOString(),
            cashCounted: false,
          },
        };
        const result = await this.registerSessionsRepository.update(
          { id: session.id, status: PosRegisterSessionStatus.OPEN },
          {
            status: PosRegisterSessionStatus.CLOSED,
            closedAt: now,
            closedByUserId: null,
            closedByName: 'Scheduled close',
            // update() types jsonb as a deep-partial; the column holds any object.
            metadata: metadata as Record<string, any> as never,
          },
        );
        if (!result.affected) continue;

        closed.push(session.id);
        const saved = await this.registerSessionsRepository.findOne({
          where: { id: session.id },
        });
        if (saved) {
          void this.reportService.dispatchCloseReport(saved, {
            serviceFormat: branch.serviceFormat ?? null,
          });
        }
        this.logger.log(
          `Closed register session ${session.id} at ${branch.name || `branch ${branch.id}`} on its ${branch.registerClosesAt} schedule.`,
        );
      }
    }
    return closed;
  }

  async openDueSessions(now: Date = new Date()): Promise<number[]> {
    const branches = await this.branchesRepository.find({
      where: { registerOpensAt: Not(IsNull()), isActive: true },
      select: {
        id: true,
        name: true,
        registerOpensAt: true,
        registerClosesAt: true,
      },
    });

    const opened: number[] = [];
    for (const branch of branches) {
      const openAt = lastScheduledOpen(branch.registerOpensAt, now);
      if (!openAt) continue;
      if (
        !isWithinOpeningHours(
          { opensAt: branch.registerOpensAt, closesAt: branch.registerClosesAt },
          now,
        )
      )
        continue;

      const alreadyOpen = await this.registerSessionsRepository.findOne({
        where: { branchId: branch.id, status: PosRegisterSessionStatus.OPEN },
      });
      if (alreadyOpen) continue;
      // Once a day: any register opened since this opening time — by the
      // schedule or by a person, closed since or not — is the day's.
      const openedToday = await this.registerSessionsRepository.findOne({
        where: { branchId: branch.id, openedAt: MoreThanOrEqual(openAt) },
      });
      if (openedToday) continue;

      // The till id the branch already uses, so its tills find this session.
      const last = await this.registerSessionsRepository.findOne({
        where: { branchId: branch.id },
        order: { openedAt: 'DESC' },
      });
      const registerId = String(last?.registerId || '').trim() || 'pos-s-web';
      const count = await this.registerSessionsRepository.count({
        where: { branchId: branch.id },
      });

      const saved = await this.registerSessionsRepository.save(
        this.registerSessionsRepository.create({
          branchId: branch.id,
          registerId,
          status: PosRegisterSessionStatus.OPEN,
          openedAt: now,
          openedByUserId: null,
          openedByName: 'Scheduled open',
          openingFloat: null,
          closingFloat: null,
          note: null,
          metadata: {
            scheduledOpen: {
              opensAt: branch.registerOpensAt,
              scheduledFor: openAt.toISOString(),
            },
          },
          branchSessionNumber: count + 1,
        }),
      );
      opened.push(Number(saved.id));
      this.logger.log(
        `Opened register session ${saved.id} at ${branch.name || `branch ${branch.id}`} on its ${branch.registerOpensAt} schedule.`,
      );
    }
    return opened;
  }
}
