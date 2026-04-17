import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Branch } from '../branches/entities/branch.entity';
import { EmailModule } from '../email/email.module';
import { User } from '../users/entities/user.entity';
import { RetailModule } from '../retail/retail.module';
import { EbirrModule } from '../ebirr/ebirr.module';
import { RetailTenant } from '../retail/entities/retail-tenant.entity';
import { TenantSubscription } from '../retail/entities/tenant-subscription.entity';
import { TenantModuleEntitlement } from '../retail/entities/tenant-module-entitlement.entity';
import { BranchStaffController } from './branch-staff.controller';
import { BranchStaffService } from './branch-staff.service';
import { BranchStaffInvite } from './entities/branch-staff-invite.entity';
import { BranchStaffAssignment } from './entities/branch-staff-assignment.entity';
import { PosPortalAuthController } from './pos-portal-auth.controller';
import { PosPortalOnboardingService } from './pos-portal-onboarding.service';
import { PosSupportController } from './pos-support.controller';
import { PosWorkspaceActivationService } from './pos-workspace-activation.service';

@Module({
  imports: [
    AuditModule,
    EmailModule,
    RetailModule,
    EbirrModule,
    TypeOrmModule.forFeature([
      BranchStaffAssignment,
      BranchStaffInvite,
      Branch,
      User,
      RetailTenant,
      TenantSubscription,
      TenantModuleEntitlement,
    ]),
  ],
  controllers: [
    BranchStaffController,
    PosPortalAuthController,
    PosSupportController,
  ],
  providers: [
    BranchStaffService,
    PosWorkspaceActivationService,
    PosPortalOnboardingService,
  ],
  exports: [
    BranchStaffService,
    PosWorkspaceActivationService,
    PosPortalOnboardingService,
  ],
})
export class BranchStaffModule {}
