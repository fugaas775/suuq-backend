import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PurchaseOrderReceiptEvent } from '../purchase-orders/entities/purchase-order-receipt-event.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { ProcurementWebhooksModule } from '../procurement-webhooks/procurement-webhooks.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { User } from '../users/entities/user.entity';
import { SupplierProfile } from './entities/supplier-profile.entity';
import { SupplierStaffAssignment } from '../supplier-staff/entities/supplier-staff-assignment.entity';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupplierProfile,
      User,
      PurchaseOrder,
      PurchaseOrderReceiptEvent,
      SupplierStaffAssignment,
    ]),
    AuditModule,
    NotificationsModule,
    ProcurementWebhooksModule,
    RealtimeModule,
  ],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
