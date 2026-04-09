import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Branch } from '../branches/entities/branch.entity';
import { PartnerCredentialAuthGuard } from './partner-credential-auth.guard';
import {
  PartnerPosCheckoutReadGuard,
  PartnerPosCheckoutWriteGuard,
  PartnerPosRegisterReadGuard,
  PartnerPosRegisterWriteGuard,
  PartnerPosSyncWriteGuard,
} from './partner-credential-scoped.guard';
import { PartnerCredential } from './entities/partner-credential.entity';
import { PartnerCredentialsController } from './partner-credentials.controller';
import { PartnerCredentialsService } from './partner-credentials.service';

@Module({
  imports: [TypeOrmModule.forFeature([PartnerCredential, Branch]), AuditModule],
  controllers: [PartnerCredentialsController],
  providers: [
    PartnerCredentialsService,
    PartnerCredentialAuthGuard,
    PartnerPosSyncWriteGuard,
    PartnerPosCheckoutReadGuard,
    PartnerPosCheckoutWriteGuard,
    PartnerPosRegisterReadGuard,
    PartnerPosRegisterWriteGuard,
  ],
  exports: [
    PartnerCredentialsService,
    PartnerCredentialAuthGuard,
    PartnerPosSyncWriteGuard,
    PartnerPosCheckoutReadGuard,
    PartnerPosCheckoutWriteGuard,
    PartnerPosRegisterReadGuard,
    PartnerPosRegisterWriteGuard,
  ],
})
export class PartnerCredentialsModule {}
