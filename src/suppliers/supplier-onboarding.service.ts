import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../auth/roles.enum';
import { User } from '../users/entities/user.entity';
import {
  SupplierActivationStatus,
  SupplierOnboardingStatus,
  SupplierProfile,
} from './entities/supplier-profile.entity';
import { SupplierStaffService } from './supplier-staff.service';
import { CreateSupplierWorkspaceDto } from './dto/create-supplier-workspace.dto';
import { SUPPLIER_SUBSCRIPTION_OPTIONS } from './supplier-subscription-pricing';

export interface CreateSupplierAccountResult {
  onboardingState: 'SUPPLIER_ACTIVATION_REQUIRED';
  message: string;
  supplier: {
    supplierProfileId: number;
    companyName: string;
    activationStatus: SupplierActivationStatus;
    onboardingStatus: SupplierOnboardingStatus;
  };
  pricing: typeof SUPPLIER_SUBSCRIPTION_OPTIONS;
}

/**
 * Provisions a first-class supplier (wholesaler) account — the supplier-side
 * mirror of PosPortalOnboardingService.createWorkspaceForUser(). Creates the
 * profile, the owner's MANAGER staff assignment, and grants SUPPLIER_ACCOUNT,
 * then returns the activation (payment) gate state.
 */
@Injectable()
export class SupplierOnboardingService {
  private readonly logger = new Logger(SupplierOnboardingService.name);

  constructor(
    @InjectRepository(SupplierProfile)
    private readonly profilesRepository: Repository<SupplierProfile>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly supplierStaffService: SupplierStaffService,
  ) {}

  async createSupplierAccountForUser(
    user: User,
    dto: CreateSupplierWorkspaceDto,
  ): Promise<CreateSupplierAccountResult> {
    const existing = await this.profilesRepository.findOne({
      where: { userId: user.id },
    });
    if (existing) {
      throw new ConflictException(
        'This account already has a supplier profile.',
      );
    }

    const profile = await this.profilesRepository.save(
      this.profilesRepository.create({
        userId: user.id,
        companyName: dto.companyName.trim(),
        legalName: dto.legalName?.trim() || null,
        taxId: dto.taxId?.trim() || null,
        countriesServed: dto.countriesServed ?? [],
        payoutDetails: dto.payoutDetails?.trim() || null,
        onboardingStatus: SupplierOnboardingStatus.DRAFT,
        activationStatus: SupplierActivationStatus.PENDING_PAYMENT,
        isActive: true,
      }),
    );

    await this.supplierStaffService.createOwnerAssignment(profile.id, user.id);

    // Ensure user.roles includes SUPPLIER_ACCOUNT so the portal session and
    // admin dashboards detect the supplier persona (mirrors POS adding
    // POS_MANAGER during workspace creation).
    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (!roles.includes(UserRole.SUPPLIER_ACCOUNT)) {
      await this.usersRepository.update(user.id, {
        roles: [...roles, UserRole.SUPPLIER_ACCOUNT],
      });
    }

    this.logger.log(
      `Created supplier account #${profile.id} for user #${user.id}`,
    );

    return {
      onboardingState: 'SUPPLIER_ACTIVATION_REQUIRED',
      message:
        'Your supplier account was created. Activate your subscription to publish offers and receive purchase orders.',
      supplier: {
        supplierProfileId: profile.id,
        companyName: profile.companyName,
        activationStatus: profile.activationStatus,
        onboardingStatus: profile.onboardingStatus,
      },
      pricing: SUPPLIER_SUBSCRIPTION_OPTIONS,
    };
  }
}
