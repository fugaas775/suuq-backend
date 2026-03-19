import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RetailCommandCenterSummaryQueryDto } from './dto/retail-command-center-summary-query.dto';
import { RetailOpsService } from './retail-ops.service';

@Injectable()
export class RetailCommandCenterReportingService {
  private readonly logger = new Logger(
    RetailCommandCenterReportingService.name,
  );

  constructor(
    private readonly configService: ConfigService,
    private readonly retailOpsService: RetailOpsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async captureScheduledCommandCenterSnapshots() {
    if (!this.isScheduleEnabled()) {
      return;
    }

    const targets = this.parseSnapshotTargets();
    if (targets.length === 0) {
      this.logger.log(
        'Retail command center snapshot schedule enabled but no valid targets were configured.',
      );
      return;
    }

    for (const target of targets) {
      try {
        await this.retailOpsService.captureNetworkCommandCenterReportSnapshot(
          target,
        );
      } catch (error) {
        this.logger.error(
          `Retail command center snapshot capture failed for branch ${target.branchId}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private isScheduleEnabled(): boolean {
    const raw = this.configService.get<string>(
      'RETAIL_COMMAND_CENTER_SNAPSHOT_SCHEDULE_ENABLED',
    );

    return (raw || '').trim().toLowerCase() === 'true';
  }

  private parseSnapshotTargets(): RetailCommandCenterSummaryQueryDto[] {
    const raw = this.configService.get<string>(
      'RETAIL_COMMAND_CENTER_SNAPSHOT_TARGETS',
    );
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((entry) => typeof entry?.branchId === 'number')
        .map((entry) => ({
          branchId: entry.branchId,
          branchLimit:
            typeof entry.branchLimit === 'number' ? entry.branchLimit : 3,
          module: entry.module,
          status: entry.status,
          hasAlertsOnly:
            typeof entry.hasAlertsOnly === 'boolean'
              ? entry.hasAlertsOnly
              : undefined,
          alertSeverity: entry.alertSeverity,
        }));
    } catch (error) {
      this.logger.warn(
        `Invalid RETAIL_COMMAND_CENTER_SNAPSHOT_TARGETS config: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}
