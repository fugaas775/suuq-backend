import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { HospitalityWorkflowsController } from './hospitality-workflows.controller';
import { HospitalityWorkflowsService } from './hospitality-workflows.service';
import { HospitalityBillIntervention } from './entities/hospitality-bill-intervention.entity';
import { HospitalityIdempotencyKey } from './entities/hospitality-idempotency-key.entity';
import { HospitalityKitchenTicket } from './entities/hospitality-kitchen-ticket.entity';
import { HospitalityTableBoard } from './entities/hospitality-table-board.entity';
import { HotelFolio } from './entities/hotel-folio.entity';
import { HotelFolioCharge } from './entities/hotel-folio-charge.entity';
import { HotelFolioController } from './hotel-folio.controller';
import { HotelFolioService } from './hotel-folio.service';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RetailModule } from '../retail/retail.module';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HospitalityKitchenTicket,
      HospitalityTableBoard,
      HospitalityBillIntervention,
      HospitalityIdempotencyKey,
      HotelFolio,
      HotelFolioCharge,
    ]),
    AuditModule,
    RetailModule,
  ],
  controllers: [HospitalityWorkflowsController, HotelFolioController],
  providers: [
    HospitalityWorkflowsService,
    HotelFolioService,
    PosBranchAccessGuard,
    RolesGuard,
  ],
  exports: [HospitalityWorkflowsService],
})
export class HospitalityModule {}
