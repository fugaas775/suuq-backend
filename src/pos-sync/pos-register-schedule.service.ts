import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  PosRegisterSession,
  PosRegisterSessionStatus,
} from './entities/pos-register-session.entity';
import { PosRegisterReportService } from './pos-register-report.service';
import { lastScheduledClose } from './register-schedule';

/**
 * Closes the registers of every branch that set a closing time. Each minute
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
}
