import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { HospitalityWorkflowsController } from './hospitality-workflows.controller';
import { HospitalityWorkflowsService } from './hospitality-workflows.service';
import { HospitalityBillIntervention } from './entities/hospitality-bill-intervention.entity';
import { HospitalityIdempotencyKey } from './entities/hospitality-idempotency-key.entity';
import { HospitalityKitchenTicket } from './entities/hospitality-kitchen-ticket.entity';
import { HospitalityTableBoard } from './entities/hospitality-table-board.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HospitalityKitchenTicket,
      HospitalityTableBoard,
      HospitalityBillIntervention,
      HospitalityIdempotencyKey,
    ]),
    AuditModule,
  ],
  controllers: [HospitalityWorkflowsController],
  providers: [HospitalityWorkflowsService],
  exports: [HospitalityWorkflowsService],
})
export class HospitalityModule {}
