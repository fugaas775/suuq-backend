import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProcurementWebhooksService } from './procurement-webhooks.service';

@Injectable()
export class ProcurementWebhooksCronService {
  private readonly logger = new Logger(ProcurementWebhooksCronService.name);

  constructor(
    private readonly procurementWebhooksService: ProcurementWebhooksService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryFailedProcurementWebhookDeliveries(): Promise<void> {
    try {
      const result =
        await this.procurementWebhooksService.retryFailedDeliveries();
      if (result.attempted > 0) {
        this.logger.log(
          `Retried ${result.attempted} procurement webhook delivery(s): ${result.succeeded} succeeded, ${result.failed} failed`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Procurement webhook retry scan failed: ${message}`);
    }
  }
}
