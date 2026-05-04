import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { HospitalityWorkflowsController } from './hospitality-workflows.controller';
import { HospitalityWorkflowsService } from './hospitality-workflows.service';
import { HospitalityBillIntervention } from './entities/hospitality-bill-intervention.entity';
import { HospitalityIdempotencyKey } from './entities/hospitality-idempotency-key.entity';
import { HospitalityKitchenTicket } from './entities/hospitality-kitchen-ticket.entity';
import { HospitalityTableBoard } from './entities/hospitality-table-board.entity';
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
    ]),
    AuditModule,
    RetailModule,
  ],
  controllers: [HospitalityWorkflowsController],
  providers: [HospitalityWorkflowsService, PosBranchAccessGuard, RolesGuard],
  exports: [HospitalityWorkflowsService],
})
export class HospitalityModule {}
