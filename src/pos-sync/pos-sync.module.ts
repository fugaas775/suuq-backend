import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { PartnerCredential } from '../partner-credentials/entities/partner-credential.entity';
import { PosSyncController } from './pos-sync.controller';
import { PosSyncService } from './pos-sync.service';
import { PosSyncJob } from './entities/pos-sync-job.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PosSyncJob, Branch, PartnerCredential])],
  controllers: [PosSyncController],
  providers: [PosSyncService],
  exports: [PosSyncService],
})
export class PosSyncModule {}
