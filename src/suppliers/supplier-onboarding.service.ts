import { Injectable, Logger } from '@nestjs/common';
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
import { SupplierActivationService } from './supplier-activation.service';
import { CreateSupplierWorkspaceDto } from './dto/create-supplier-workspace.dto';
import { SUPPLIER_SUBSCRIPTION_OPTIONS } from './supplier-subscription-pricing';
import { formatSupplierFreePeriodEndsAt } from './supplier-free-period.policy';

export interface CreateSupplierAccountResult {
  onboardingState:
    | 'SUPPLIER_ACTIVATION_REQUIRED'
    | 'SUPPLIER_FREE_PERIOD_ACTIVE';
  message: string;
  supplier: {
    supplierProfileId: number;
    companyName: string;
    activationStatus: SupplierActivationStatus;
    onboardingStatus: SupplierOnboardingStatus;
  };
  /**
   * Present when the account opened on the free period. Null means it still
   * needs payment — because the promotion has closed, or because this account
   * already spent its one free workspace (here or on a POS branch).
   */
  freePeriod: { planCode: string; endsAt: string | null } | null;
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
    private readonly supplierActivationService: SupplierActivationService,
  ) {}

  async createSupplierAccountForUser(
    user: User,
    dto: CreateSupplierWorkspaceDto,
  ): Promise<CreateSupplierAccountResult> {
    // Multi-supplier: an account may own several supplier profiles, so we no
    // longer reject when one already exists. Each created profile is independent
    // (its own catalog, billing, staff and inbox) and selectable via the portal
    // supplier switcher.
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

    // One free workspace per account, and the account chooses what to spend it
    // on. A supplier profile is as valid a choice as a POS branch — so a first
    // supplier opens free, and a second one (or a supplier on an account whose
    // free branch is already running) pays. grantFreePeriod settles which of
    // those this is; a null answer simply means "chargeable".
    const freePeriod = await this.supplierActivationService.grantFreePeriod(
      profile.id,
      user.id,
    );

    // grantFreePeriod flips the profile to ACTIVE on the row it loaded itself,
    // so the copy of the profile held here is a save behind.
    if (freePeriod) {
      profile.activationStatus = SupplierActivationStatus.ACTIVE;
    }

    this.logger.log(
      `Created supplier account #${profile.id} for user #${user.id}` +
        (freePeriod ? ' on the free period' : ''),
    );

    return {
      onboardingState: freePeriod
        ? 'SUPPLIER_FREE_PERIOD_ACTIVE'
        : 'SUPPLIER_ACTIVATION_REQUIRED',
      message: freePeriod
        ? `Your supplier account is open and free until ${formatSupplierFreePeriodEndsAt()}.`
        : 'Your supplier account was created. Activate your subscription to publish offers and receive purchase orders.',
      supplier: {
        supplierProfileId: profile.id,
        companyName: profile.companyName,
        activationStatus: profile.activationStatus,
        onboardingStatus: profile.onboardingStatus,
      },
      freePeriod: freePeriod
        ? {
            planCode: freePeriod.planCode,
            endsAt: freePeriod.endsAt
              ? new Date(freePeriod.endsAt).toISOString()
              : null,
          }
        : null,
      pricing: SUPPLIER_SUBSCRIPTION_OPTIONS,
    };
  }
}
