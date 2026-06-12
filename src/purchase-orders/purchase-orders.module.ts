import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { BranchesModule } from '../branches/branches.module';
import { EmailModule } from '../email/email.module';
import { AccountingModule } from '../accounting/accounting.module';
import { Branch } from '../branches/entities/branch.entity';
import { Product } from '../products/entities/product.entity';
import { ProcurementWebhooksModule } from '../procurement-webhooks/procurement-webhooks.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SupplierOffer } from '../supplier-offers/entities/supplier-offer.entity';
import { SupplierProfile } from '../suppliers/entities/supplier-profile.entity';
import {
  PurchaseOrder,
  PurchaseOrderItem,
} from './entities/purchase-order.entity';
import { PurchaseOrderReceiptEvent } from './entities/purchase-order-receipt-event.entity';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [
    AuditModule,
    EmailModule,
    forwardRef(() => BranchesModule),
    ProcurementWebhooksModule,
    RealtimeModule,
    AccountingModule,
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseOrderItem,
      PurchaseOrderReceiptEvent,
      Branch,
      SupplierProfile,
      Product,
      SupplierOffer,
    ]),
  ],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
