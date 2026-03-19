import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchesModule } from '../branches/branches.module';
import { Branch } from '../branches/entities/branch.entity';
import { PartnerCredentialsModule } from '../partner-credentials/partner-credentials.module';
import { PartnerCredential } from '../partner-credentials/entities/partner-credential.entity';
import { ProductAliasesModule } from '../product-aliases/product-aliases.module';
import { RetailModule } from '../retail/retail.module';
import { PosPartnerSyncController } from './pos-partner-sync.controller';
import { PosSyncController } from './pos-sync.controller';
import { PosSyncService } from './pos-sync.service';
import { PosSyncJob } from './entities/pos-sync-job.entity';

@Module({
  imports: [
    BranchesModule,
    PartnerCredentialsModule,
    ProductAliasesModule,
    RetailModule,
    TypeOrmModule.forFeature([PosSyncJob, Branch, PartnerCredential]),
  ],
  controllers: [PosSyncController, PosPartnerSyncController],
  providers: [PosSyncService],
  exports: [PosSyncService],
})
export class PosSyncModule {}
