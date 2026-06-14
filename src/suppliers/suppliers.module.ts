import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { EbirrModule } from '../ebirr/ebirr.module';
import { User } from '../users/entities/user.entity';
import { SupplierProfile } from './entities/supplier-profile.entity';
import { SupplierStaffAssignment } from './entities/supplier-staff-assignment.entity';
import { SupplierSubscription } from './entities/supplier-subscription.entity';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { SupplierStaffService } from './supplier-staff.service';
import { SupplierStaffController } from './supplier-staff.controller';
import { SupplierOnboardingService } from './supplier-onboarding.service';
import { SupplierActivationService } from './supplier-activation.service';

@Module({
  imports: [
    AuditModule,
    EbirrModule,
    TypeOrmModule.forFeature([
      SupplierProfile,
      SupplierStaffAssignment,
      SupplierSubscription,
      User,
    ]),
  ],
  controllers: [SuppliersController, SupplierStaffController],
  providers: [
    SuppliersService,
    SupplierStaffService,
    SupplierOnboardingService,
    SupplierActivationService,
  ],
  exports: [
    SuppliersService,
    SupplierStaffService,
    SupplierOnboardingService,
    SupplierActivationService,
  ],
})
export class SuppliersModule {}
