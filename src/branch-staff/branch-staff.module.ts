import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Branch } from '../branches/entities/branch.entity';
import { EmailModule } from '../email/email.module';
import { User } from '../users/entities/user.entity';
import { RetailModule } from '../retail/retail.module';
import { EbirrModule } from '../ebirr/ebirr.module';
import { RedisModule } from '../redis/redis.module';
import { RetailTenant } from '../retail/entities/retail-tenant.entity';
import { TenantSubscription } from '../retail/entities/tenant-subscription.entity';
import { TenantModuleEntitlement } from '../retail/entities/tenant-module-entitlement.entity';
import { BranchStaffController } from './branch-staff.controller';
import { BranchSecurityController } from './branch-security.controller';
import { BranchStaffService } from './branch-staff.service';
import { BranchStaffAssignment } from './entities/branch-staff-assignment.entity';
import { BranchStaffInvite } from './entities/branch-staff-invite.entity';
import { BranchShift } from './entities/branch-shift.entity';
import { BranchShiftStaff } from './entities/branch-shift-staff.entity';
import { BranchShiftService } from './branch-shift.service';
import { BranchShiftController } from './branch-shift.controller';
import { PosPortalAuthController } from './pos-portal-auth.controller';
import { PosPortalOnboardingService } from './pos-portal-onboarding.service';
import { PosSupportController } from './pos-support.controller';
import { PosWorkspaceActivationService } from './pos-workspace-activation.service';
import { SellerWorkspace } from '../seller-workspace/entities/seller-workspace.entity';
import { SuppliersModule } from '../suppliers/suppliers.module';

@Module({
  imports: [
    AuditModule,
    EmailModule,
    RetailModule,
    EbirrModule,
    RedisModule,
    SuppliersModule,
    TypeOrmModule.forFeature([
      BranchStaffAssignment,
      BranchStaffInvite,
      BranchShift,
      BranchShiftStaff,
      Branch,
      User,
      RetailTenant,
      TenantSubscription,
      TenantModuleEntitlement,
      SellerWorkspace,
    ]),
  ],
  controllers: [
    BranchStaffController,
    BranchSecurityController,
    BranchShiftController,
    PosPortalAuthController,
    PosSupportController,
  ],
  providers: [
    BranchStaffService,
    BranchShiftService,
    PosWorkspaceActivationService,
    PosPortalOnboardingService,
  ],
  exports: [
    BranchStaffService,
    BranchShiftService,
    PosWorkspaceActivationService,
    PosPortalOnboardingService,
  ],
})
export class BranchStaffModule {}
