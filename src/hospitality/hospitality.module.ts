import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { HospitalityWorkflowsController } from './hospitality-workflows.controller';
import { HospitalityWorkflowsService } from './hospitality-workflows.service';
import { HospitalityBillIntervention } from './entities/hospitality-bill-intervention.entity';
import { HospitalityIdempotencyKey } from './entities/hospitality-idempotency-key.entity';
import { HospitalityKitchenTicket } from './entities/hospitality-kitchen-ticket.entity';
import { HospitalityTableBoard } from './entities/hospitality-table-board.entity';
import { KitchenProductAvailability } from './entities/kitchen-product-availability.entity';
import { HotelFolio } from './entities/hotel-folio.entity';
import { HotelFolioCharge } from './entities/hotel-folio-charge.entity';
import { HotelRoom } from './entities/hotel-room.entity';
import { HotelRatePlan } from './entities/hotel-rate-plan.entity';
import { HotelReservation } from './entities/hotel-reservation.entity';
import { HotelNightAuditLog } from './entities/hotel-night-audit-log.entity';
import { HotelFolioController } from './hotel-folio.controller';
import { HotelFolioService } from './hotel-folio.service';
import { HotelInventoryController } from './hotel-inventory.controller';
import { HotelInventoryService } from './hotel-inventory.service';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RetailModule } from '../retail/retail.module';
import { AccountingModule } from '../accounting/accounting.module';
import { RolesGuard } from '../auth/roles.guard';
import { ConsumerHotelController } from './consumer-hotel.controller';
import { HotelPrepaymentService } from './hotel-prepayment.service';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { User } from '../users/entities/user.entity';
import { EbirrModule } from '../ebirr/ebirr.module';
import { TelebirrModule } from '../telebirr/telebirr.module';
import { MpesaModule } from '../mpesa/mpesa.module';
import { StarpayModule } from '../starpay/starpay.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HospitalityKitchenTicket,
      HospitalityTableBoard,
      HospitalityBillIntervention,
      HospitalityIdempotencyKey,
      KitchenProductAvailability,
      HotelFolio,
      HotelFolioCharge,
      HotelRoom,
      HotelRatePlan,
      HotelReservation,
      HotelNightAuditLog,
      VendorStore,
      User,
    ]),
    AuditModule,
    RetailModule,
    EbirrModule,
    TelebirrModule,
    MpesaModule,
    StarpayModule,
    AccountingModule,
  ],
  controllers: [
    HospitalityWorkflowsController,
    HotelFolioController,
    HotelInventoryController,
    ConsumerHotelController,
  ],
  providers: [
    HospitalityWorkflowsService,
    HotelFolioService,
    HotelInventoryService,
    HotelPrepaymentService,
    PosBranchAccessGuard,
    RolesGuard,
  ],
  exports: [HospitalityWorkflowsService],
})
export class HospitalityModule {}
