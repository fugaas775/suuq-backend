import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Branch } from '../branches/entities/branch.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupplierProfile } from '../suppliers/entities/supplier-profile.entity';
import { ProcurementWebhookDelivery } from './entities/procurement-webhook-delivery.entity';
import { ProcurementWebhookSubscription } from './entities/procurement-webhook-subscription.entity';
import { ProcurementWebhooksCronService } from './procurement-webhooks-cron.service';
import { ProcurementWebhooksController } from './procurement-webhooks.controller';
import { ProcurementWebhooksService } from './procurement-webhooks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProcurementWebhookSubscription,
      ProcurementWebhookDelivery,
      Branch,
      SupplierProfile,
    ]),
    AuditModule,
    NotificationsModule,
  ],
  controllers: [ProcurementWebhooksController],
  providers: [ProcurementWebhooksService, ProcurementWebhooksCronService],
  exports: [ProcurementWebhooksService],
})
export class ProcurementWebhooksModule {}
