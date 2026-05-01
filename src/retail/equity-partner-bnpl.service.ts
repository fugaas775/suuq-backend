import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from '../branch-staff/entities/branch-staff-assignment.entity';
import { EbirrService } from '../ebirr/ebirr.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../auth/roles.enum';
import {
  POS_BRANCH_SUBSCRIPTION_OPTIONS,
  PosBranchSubscriptionPeriod,
  requirePosBranchSubscriptionOption,
} from '../branch-staff/pos-workspace-pricing';
import {
  EquityPartner,
  EquityPartnerStatus,
} from './entities/equity-partner.entity';
import {
  EquityPartnerBnplActivation,
  EquityPartnerBnplStatus,
} from './entities/equity-partner-bnpl-activation.entity';
import { EquityPartnerService } from './equity-partner.service';
import {
  TenantBillingInterval,
  TenantSubscription,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';

const BNPL_REFERENCE_PREFIX = 'BNPLACT';

export interface StartBnplActivationInput {
  branchName: string;
  serviceFormat: string;
  targetOwnerEmail: string;
  period: PosBranchSubscriptionPeriod;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
}

@Injectable()
export class EquityPartnerBnplService {
  private readonly logger = new Logger(EquityPartnerBnplService.name);

  constructor(
    @InjectRepository(EquityPartner)
    private readonly partnersRepo: Repository<EquityPartner>,
    @InjectRepository(EquityPartnerBnplActivation)
    private readonly activationsRepo: Repository<EquityPartnerBnplActivation>,
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly assignmentsRepo: Repository<BranchStaffAssignment>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionsRepo: Repository<TenantSubscription>,
    private readonly equityPartnerService: EquityPartnerService,
    private readonly ebirrService: EbirrService,
  ) {}

  // ---------------------------------------------------------------------------
  // Partner-facing API
  // ---------------------------------------------------------------------------

  /**
   * Start a BNPL-funded branch activation on behalf of an end-user.
   *
   * The branch and its tenant subscription are provisioned immediately
   * (status=ACTIVE) and ownership is transferred to the resolved end-user.
   * The partner owes `option.amount` until `dueAt` (= subscription end).
   */
  async startBnplActivation(
    partnerUserId: number,
    input: StartBnplActivationInput,
  ): Promise<EquityPartnerBnplActivation> {
    const partner = await this.requireActivePartnerForUser(partnerUserId);
    await this.assertCreditCapacity(partner);

    const option = requirePosBranchSubscriptionOption(input.period);
    const targetUser = await this.findOrCreateTargetOwner(
      input.targetOwnerEmail,
    );

    // Find a tenant the partner can use to host this branch. Re-use the
    // partner's existing primary tenant if one exists; otherwise reject so
    // the partner first activates one of their own branches.
    const partnerTenantId = await this.resolvePartnerTenantId(partner);

    const branchName = String(input.branchName || '').trim();
    if (!branchName) {
      throw new BadRequestException('branchName is required.');
    }
    const serviceFormat = String(input.serviceFormat || '')
      .trim()
      .toUpperCase();
    if (!serviceFormat) {
      throw new BadRequestException('serviceFormat is required.');
    }

    const code = await this.generateBranchCode(branchName);
    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setMonth(endsAt.getMonth() + option.months);

    const branch = await this.branchesRepo.save(
      this.branchesRepo.create({
        name: branchName,
        code,
        serviceFormat,
        ownerId: targetUser.id,
        retailTenantId: partnerTenantId,
        city: input.city ?? null,
        country: input.country ?? null,
        phone: input.phone ?? null,
        isActive: true,
      }),
    );

    // Owner staff assignment for the target user.
    await this.assignmentsRepo.save(
      this.assignmentsRepo.create({
        branchId: branch.id,
        userId: targetUser.id,
        role: BranchStaffRole.MANAGER,
        permissions: [],
        isActive: true,
      }),
    );

    // Partner is added as a manager to support onboarding (revocable later).
    if (partner.userId && partner.userId !== targetUser.id) {
      await this.assignmentsRepo.save(
        this.assignmentsRepo.create({
          branchId: branch.id,
          userId: partner.userId,
          role: BranchStaffRole.MANAGER,
          permissions: [],
          isActive: true,
        }),
      );
    }

    const subscription = await this.subscriptionsRepo.save(
      this.subscriptionsRepo.create({
        tenantId: partnerTenantId,
        branchId: branch.id,
        planCode: option.planCode,
        status: TenantSubscriptionStatus.ACTIVE,
        billingInterval:
          option.period === 'ONE_YEAR'
            ? TenantBillingInterval.ONE_YEAR
            : TenantBillingInterval.SIX_MONTHS,
        amount: option.amount,
        currency: option.currency,
        periodMonths: option.months,
        amountTotal: option.amount,
        startsAt: now,
        endsAt,
        autoRenew: false,
        metadata: {
          fundingMode: 'EQUITY_BNPL',
          equityPartnerId: partner.id,
        },
      }),
    );

    // Link partner equity split to the new branch (so they earn from it).
    try {
      await this.equityPartnerService.recordReferralFromActivation(
        partner.id,
        branch.id,
        partnerTenantId,
      );
    } catch (err: any) {
      this.logger.warn(
        `BNPL referral split link failed for branch ${branch.id}: ${err?.message}`,
      );
    }

    const activation = await this.activationsRepo.save(
      this.activationsRepo.create({
        equityPartnerId: partner.id,
        branchId: branch.id,
        tenantSubscriptionId: subscription.id,
        targetOwnerUserId: targetUser.id,
        period: option.period,
        amountDue: option.amount,
        currency: option.currency,
        status: EquityPartnerBnplStatus.OUTSTANDING,
        dueAt: endsAt,
        metadata: {
          targetOwnerEmail: input.targetOwnerEmail,
          targetOwnerWasCreated: targetUser.requiresGoogleLink === true,
        },
      }),
    );

    this.logger.log(
      `Equity partner ${partner.id} created BNPL branch ${branch.id} for user ${targetUser.id}; due ${endsAt.toISOString()}`,
    );

    return activation;
  }

  async listOutstandingForPartner(
    partnerUserId: number,
  ): Promise<EquityPartnerBnplActivation[]> {
    const partner = await this.requireActivePartnerForUser(partnerUserId);
    return this.activationsRepo.find({
      where: { equityPartnerId: partner.id },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Initiate Ebirr settlement for a single OUTSTANDING activation. On
   * successful payment the activation is marked SETTLED via the existing
   * Ebirr webhook handler (out of scope here — for MVP we expose the
   * initiate call and an explicit `markSettled` admin action).
   */
  async initiateSettlementPayment(
    partnerUserId: number,
    activationId: number,
    phoneNumber: string,
  ) {
    const partner = await this.requireActivePartnerForUser(partnerUserId);
    const activation = await this.activationsRepo.findOne({
      where: { id: activationId },
    });
    if (!activation || activation.equityPartnerId !== partner.id) {
      throw new NotFoundException(
        `BNPL activation #${activationId} not found.`,
      );
    }
    if (activation.status !== EquityPartnerBnplStatus.OUTSTANDING) {
      throw new BadRequestException(
        `Activation #${activationId} is already ${activation.status}.`,
      );
    }

    const referenceId = `${BNPL_REFERENCE_PREFIX}-${activation.id}-${Date.now()}`;
    const invoiceId = `${BNPL_REFERENCE_PREFIX}INV-${activation.id}`;

    const response = await this.ebirrService.initiatePayment({
      phoneNumber,
      amount: Number(activation.amountDue).toFixed(2),
      referenceId,
      invoiceId,
      description: `Equity partner BNPL settlement for branch ${activation.branchId}`,
    });

    activation.settlementReferenceId = referenceId;
    activation.metadata = {
      ...(activation.metadata ?? {}),
      lastSettlementAttempt: {
        referenceId,
        startedAt: new Date().toISOString(),
      },
    };
    await this.activationsRepo.save(activation);

    return { referenceId, response };
  }

  // ---------------------------------------------------------------------------
  // Admin-facing API
  // ---------------------------------------------------------------------------

  async listForPartnerAdmin(
    partnerId: number,
  ): Promise<EquityPartnerBnplActivation[]> {
    return this.activationsRepo.find({
      where: { equityPartnerId: partnerId },
      order: { createdAt: 'DESC' },
    });
  }

  async setCreditLimit(
    partnerId: number,
    limit: number,
  ): Promise<EquityPartner> {
    if (!Number.isInteger(limit) || limit < 0 || limit > 100) {
      throw new BadRequestException(
        'limit must be an integer between 0 and 100.',
      );
    }
    const partner = await this.partnersRepo.findOne({
      where: { id: partnerId },
    });
    if (!partner) {
      throw new NotFoundException(`Equity partner #${partnerId} not found.`);
    }
    partner.bnplCreditLimit = limit;
    return this.partnersRepo.save(partner);
  }

  async forgive(activationId: number, note?: string) {
    const activation = await this.activationsRepo.findOne({
      where: { id: activationId },
    });
    if (!activation) {
      throw new NotFoundException(
        `BNPL activation #${activationId} not found.`,
      );
    }
    if (activation.status !== EquityPartnerBnplStatus.OUTSTANDING) {
      throw new BadRequestException(
        `Activation #${activationId} is already ${activation.status}.`,
      );
    }
    activation.status = EquityPartnerBnplStatus.FORGIVEN;
    activation.settledAt = new Date();
    activation.metadata = {
      ...(activation.metadata ?? {}),
      forgiveNote: note ?? null,
      forgivenAt: new Date().toISOString(),
    };
    return this.activationsRepo.save(activation);
  }

  async markSettled(activationId: number, referenceId?: string) {
    const activation = await this.activationsRepo.findOne({
      where: { id: activationId },
    });
    if (!activation) {
      throw new NotFoundException(
        `BNPL activation #${activationId} not found.`,
      );
    }
    if (activation.status === EquityPartnerBnplStatus.SETTLED) {
      return activation;
    }
    activation.status = EquityPartnerBnplStatus.SETTLED;
    activation.settledAt = new Date();
    if (referenceId) {
      activation.settlementReferenceId = referenceId;
    }
    return this.activationsRepo.save(activation);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Pricing table exposed to the partner UI. */
  getSubscriptionOptions() {
    return POS_BRANCH_SUBSCRIPTION_OPTIONS.map((option) => ({
      period: option.period,
      months: option.months,
      amount: option.amount,
      currency: option.currency,
      label: option.label,
    }));
  }

  private async requireActivePartnerForUser(
    userId: number,
  ): Promise<EquityPartner> {
    const partner = await this.partnersRepo.findOne({ where: { userId } });
    if (!partner) {
      throw new ForbiddenException(
        'Only an approved equity partner can create BNPL branches.',
      );
    }
    if (partner.status !== EquityPartnerStatus.ACTIVE) {
      throw new ForbiddenException(
        'Equity partner is not active; BNPL activation is disabled.',
      );
    }
    return partner;
  }

  private async assertCreditCapacity(partner: EquityPartner) {
    const outstanding = await this.activationsRepo.count({
      where: {
        equityPartnerId: partner.id,
        status: EquityPartnerBnplStatus.OUTSTANDING,
      },
    });
    if (outstanding >= partner.bnplCreditLimit) {
      throw new BadRequestException(
        `BNPL credit limit reached (${outstanding}/${partner.bnplCreditLimit}). Settle an existing activation before creating another.`,
      );
    }
  }

  private async resolvePartnerTenantId(
    partner: EquityPartner,
  ): Promise<number> {
    if (!partner.userId) {
      throw new ForbiddenException(
        'Partner is not linked to a POS user account; cannot host BNPL branches.',
      );
    }
    const ownedBranch = await this.branchesRepo.findOne({
      where: { ownerId: partner.userId, isActive: true },
      select: ['id', 'retailTenantId'],
    });
    if (!ownedBranch?.retailTenantId) {
      throw new BadRequestException(
        'Partner must have at least one active POS branch with a retail tenant before BNPL activation.',
      );
    }
    return ownedBranch.retailTenantId;
  }

  private async findOrCreateTargetOwner(rawEmail: string): Promise<
    User & {
      requiresGoogleLink?: boolean;
    }
  > {
    const email = String(rawEmail || '')
      .trim()
      .toLowerCase();
    if (!email || !email.includes('@')) {
      throw new BadRequestException('targetOwnerEmail must be a valid email.');
    }
    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing) {
      return existing;
    }
    const created = await this.usersRepo.save(
      this.usersRepo.create({
        email,
        displayName: email,
        roles: [UserRole.CUSTOMER],
        // No password / firebaseUid: Google sign-in will link on first login.
      } as Partial<User>),
    );
    (created as any).requiresGoogleLink = true;
    return created as User & { requiresGoogleLink?: boolean };
  }

  private async generateBranchCode(branchName: string): Promise<string> {
    const base =
      branchName
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((token) => token.slice(0, 3))
        .join('')
        .slice(0, 9) || 'BRANCH';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const suffix = `${Date.now()}`.slice(-6);
      const code = `${base}-${suffix}${attempt ? `-${attempt}` : ''}`.slice(
        0,
        64,
      );
      const existing = await this.branchesRepo.findOne({ where: { code } });
      if (!existing) return code;
    }
    throw new Error('Could not generate a unique branch code.');
  }
}
