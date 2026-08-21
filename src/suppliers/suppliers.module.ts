import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { EbirrModule } from '../ebirr/ebirr.module';
import { User } from '../users/entities/user.entity';
import { Branch } from '../branches/entities/branch.entity';
import { SupplierProfile } from './entities/supplier-profile.entity';
import { SupplierStaffAssignment } from './entities/supplier-staff-assignment.entity';
import { SupplierSubscription } from './entities/supplier-subscription.entity';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { SupplierStaffService } from './supplier-staff.service';
import { SupplierStaffController } from './supplier-staff.controller';
import { SupplierOnboardingService } from './supplier-onboarding.service';
import { SupplierActivationService } from './supplier-activation.service';
import { SupplierOutletService } from './supplier-outlet.service';
import { SupplierSubscriptionLifecycleService } from './supplier-subscription-lifecycle.service';

@Module({
  imports: [
    AuditModule,
    EbirrModule,
    // Branch is registered here so SupplierStaffService can resolve a supplier's
    // backing outlet branch for the supplier context. SupplierOutletService uses
    // the global DataSource (getRepository / manager) for its cross-aggregate
    // provisioning, so it needs no extra forFeature entries.
    TypeOrmModule.forFeature([
      SupplierProfile,
      SupplierStaffAssignment,
      SupplierSubscription,
      User,
      Branch,
    ]),
  ],
  controllers: [SuppliersController, SupplierStaffController],
  providers: [
    SuppliersService,
    SupplierStaffService,
    SupplierOnboardingService,
    SupplierActivationService,
    SupplierOutletService,
    SupplierSubscriptionLifecycleService,
  ],
  exports: [
    SuppliersService,
    SupplierStaffService,
    SupplierOnboardingService,
    SupplierActivationService,
    SupplierOutletService,
    SupplierSubscriptionLifecycleService,
  ],
})
export class SuppliersModule {}
