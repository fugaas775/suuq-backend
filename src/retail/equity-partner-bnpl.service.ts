import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
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
  EquityPartnerBnplAccountKind,
  EquityPartnerBnplActivation,
  EquityPartnerBnplStatus,
} from './entities/equity-partner-bnpl-activation.entity';
import {
  SupplierActivationStatus,
  SupplierProfile,
} from '../suppliers/entities/supplier-profile.entity';
import { SupplierOnboardingService } from '../suppliers/supplier-onboarding.service';
import { SupplierActivationService } from '../suppliers/supplier-activation.service';
import {
  SUPPLIER_SUBSCRIPTION_OPTIONS,
  requireSupplierSubscriptionOption,
} from '../suppliers/supplier-subscription-pricing';
import {
  EquityPartnerBnplCreditLedgerEntry,
  EquityPartnerBnplCreditLedgerEntryType,
} from './entities/equity-partner-bnpl-credit-ledger.entity';
import { EQUITY_PRICING, EquityPartnerService } from './equity-partner.service';
import {
  TenantBillingInterval,
  TenantSubscription,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';
import {
  RetailTenant,
  RetailTenantStatus,
} from './entities/retail-tenant.entity';
import {
  RetailModule,
  TenantModuleEntitlement,
} from './entities/tenant-module-entitlement.entity';
import { In } from 'typeorm';

const BNPL_REFERENCE_PREFIX = 'BNPLACT';

export interface StartBnplActivationInput {
  /** 'BRANCH' (default) funds a POS branch; 'SUPPLIER' funds a supplier account. */
  accountKind?: EquityPartnerBnplAccountKind;
  /**
   * 'BNPL' (default) draws the partner's equity credit and leaves a net balance
   * OUTSTANDING (consumes a BNPL slot). 'DIRECT_EBIRR' charges the full amount
   * now via Ebirr — no equity credit, no slot consumed.
   */
  fundingType?: 'BNPL' | 'DIRECT_EBIRR';
  /** Ebirr line the partner pays from — required when fundingType='DIRECT_EBIRR'. */
  paymentPhone?: string;
  targetOwnerEmail: string;
  period: PosBranchSubscriptionPeriod;
  // Branch-only fields (required when accountKind !== 'SUPPLIER').
  branchName?: string;
  serviceFormat?: string;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  phone?: string | null;
  tinNumber?: string | null;
  // Supplier-only fields (used when accountKind === 'SUPPLIER').
  supplierCompanyName?: string;
  legalName?: string | null;
  taxId?: string | null;
  countriesServed?: string[];
}

@Injectable()
export class EquityPartnerBnplService {
  private readonly logger = new Logger(EquityPartnerBnplService.name);

  constructor(
    @InjectRepository(EquityPartner)
    private readonly partnersRepo: Repository<EquityPartner>,
    @InjectRepository(EquityPartnerBnplActivation)
    private readonly activationsRepo: Repository<EquityPartnerBnplActivation>,
    @InjectRepository(EquityPartnerBnplCreditLedgerEntry)
    private readonly creditLedgerRepo: Repository<EquityPartnerBnplCreditLedgerEntry>,
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly assignmentsRepo: Repository<BranchStaffAssignment>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionsRepo: Repository<TenantSubscription>,
    @InjectRepository(RetailTenant)
    private readonly retailTenantsRepo: Repository<RetailTenant>,
    @InjectRepository(TenantModuleEntitlement)
    private readonly moduleEntitlementsRepo: Repository<TenantModuleEntitlement>,
    @InjectRepository(SupplierProfile)
    private readonly supplierProfilesRepo: Repository<SupplierProfile>,
    private readonly equityPartnerService: EquityPartnerService,
    private readonly ebirrService: EbirrService,
    private readonly supplierOnboardingService: SupplierOnboardingService,
    private readonly supplierActivationService: SupplierActivationService,
  ) {}

  // ---------------------------------------------------------------------------
  // Partner-facing API
  // ---------------------------------------------------------------------------

  /**
   * Start a BNPL-funded branch activation on behalf of an end-user.
   *
   * The branch and its tenant subscription are provisioned immediately
   * (status=ACTIVE) and ownership is transferred to the resolved end-user.
   * The partner settles only the prepaid amount net of their earned equity
   * share for the funded period.
   */
  async startBnplActivation(
    partnerUserId: number,
    input: StartBnplActivationInput,
    roles?: string[],
  ): Promise<EquityPartnerBnplActivation> {
    const isSuperAdmin =
      Array.isArray(roles) && roles.includes(UserRole.SUPER_ADMIN);
    const isDirect = input.fundingType === 'DIRECT_EBIRR';
    if (isDirect && !String(input.paymentPhone || '').trim()) {
      throw new BadRequestException(
        'paymentPhone is required for direct (Ebirr) payment.',
      );
    }

    const partner = isSuperAdmin
      ? await this.resolveSuperAdminPartner(partnerUserId)
      : await this.requireActivePartnerForUser(partnerUserId);
    // Super-admins have unlimited slots; direct payment consumes none.
    if (!isSuperAdmin && !isDirect) {
      await this.assertCreditCapacity(partner);
    }

    const accountKind: EquityPartnerBnplAccountKind =
      input.accountKind === 'SUPPLIER' ? 'SUPPLIER' : 'BRANCH';
    if (accountKind === 'SUPPLIER') {
      return this.activateSupplierAccount(partner, input, isSuperAdmin);
    }

    const option = requirePosBranchSubscriptionOption(input.period);
    const grossAmount = option.amount;
    const equityCreditAmount = isDirect
      ? 0
      : this.calculateEquityCreditAmount(grossAmount);
    const settlementAmountDue = Math.max(0, grossAmount - equityCreditAmount);
    const targetUser = await this.findOrCreateTargetOwner(
      input.targetOwnerEmail,
      { isSuperAdmin },
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
        address: input.address ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        phone: input.phone ?? null,
        tinNumber: input.tinNumber ?? null,
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

    // Also assign the equity partner as a manager so they can see and switch
    // to branches they create from their own SellerHQ session.
    if (partner.userId !== targetUser.id) {
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
            : TenantBillingInterval.MONTHLY,
        amount: option.amount,
        currency: option.currency,
        periodMonths: option.months,
        amountTotal: option.amount,
        startsAt: now,
        endsAt,
        autoRenew: false,
        metadata: {
          fundingMode: isDirect ? 'DIRECT_EBIRR' : 'EQUITY_BNPL',
          equityPartnerId: partner.id,
        },
      }),
    );

    // Provision POS_CORE + INVENTORY_CORE entitlements so the branch is
    // immediately openable — matching the standard self-serve onboarding set.
    const existingEntitlements = await this.moduleEntitlementsRepo.find({
      where: [
        { tenantId: partnerTenantId, module: RetailModule.POS_CORE },
        { tenantId: partnerTenantId, module: RetailModule.INVENTORY_CORE },
      ],
    });
    const hasModule = (module: RetailModule) =>
      existingEntitlements.some((e) => e.module === module);
    const modulesToProvision = [
      RetailModule.POS_CORE,
      RetailModule.INVENTORY_CORE,
    ].filter((module) => !hasModule(module));
    if (modulesToProvision.length) {
      await this.moduleEntitlementsRepo.save(
        modulesToProvision.map((module) =>
          this.moduleEntitlementsRepo.create({
            tenantId: partnerTenantId,
            module,
            enabled: true,
            startsAt: now,
            expiresAt: endsAt,
            reason: `BNPL activation by equity partner #${partner.id}`,
          }),
        ),
      );
    }

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
        amountDue: grossAmount,
        equityCreditAmount,
        settlementAmountDue,
        currency: option.currency,
        status: EquityPartnerBnplStatus.OUTSTANDING,
        dueAt: endsAt,
        metadata: {
          targetOwnerEmail: input.targetOwnerEmail,
          targetOwnerWasCreated: targetUser.requiresGoogleLink === true,
          fundingMode: isDirect ? 'DIRECT_EBIRR' : 'EQUITY_BNPL',
          settlementModel: isDirect ? 'DIRECT_PAYMENT' : 'NET_OF_EQUITY_CREDIT',
        },
      }),
    );

    this.logger.log(
      `Equity partner ${partner.id} created ${
        isDirect ? 'direct-paid' : 'BNPL'
      } branch ${branch.id} for user ${targetUser.id}; due ${endsAt.toISOString()}`,
    );

    await this.ensureCreditLedgerEntry(activation);

    if (isDirect) {
      const { payment } = await this.chargeActivationViaEbirr(
        activation,
        String(input.paymentPhone),
      );
      return Object.assign(activation, { payment });
    }

    return activation;
  }

  /**
   * BNPL-fund a supplier (wholesaler) account for the target owner. Mirrors the
   * branch flow: the supplier subscription is provisioned ACTIVE immediately and
   * the partner settles the net (gross − equity credit) via Ebirr. No recurring
   * equity referral split is created (suppliers have no branch/tenant to attach
   * one to) — the partner earns the activation equity credit only.
   */
  private async activateSupplierAccount(
    partner: EquityPartner,
    input: StartBnplActivationInput,
    isSuperAdmin: boolean,
  ): Promise<EquityPartnerBnplActivation> {
    const isDirect = input.fundingType === 'DIRECT_EBIRR';
    const option = requireSupplierSubscriptionOption(input.period);
    const grossAmount = option.amount;
    const equityCreditAmount = isDirect
      ? 0
      : this.calculateEquityCreditAmount(grossAmount);
    const settlementAmountDue = Math.max(0, grossAmount - equityCreditAmount);

    const companyName = String(input.supplierCompanyName || '').trim();
    if (!companyName) {
      throw new BadRequestException('supplierCompanyName is required.');
    }

    const targetUser = await this.findOrCreateTargetOwner(
      input.targetOwnerEmail,
      { isSuperAdmin },
    );

    // Find-or-create the supplier profile for the target owner.
    // createSupplierAccountForUser throws if one already exists, so reuse it.
    let profile = await this.supplierProfilesRepo.findOne({
      where: { userId: targetUser.id },
    });
    if (!profile) {
      const created =
        await this.supplierOnboardingService.createSupplierAccountForUser(
          targetUser,
          {
            companyName,
            legalName: input.legalName ?? undefined,
            taxId: input.taxId ?? undefined,
            countriesServed: input.countriesServed ?? undefined,
          },
        );
      profile = await this.supplierProfilesRepo.findOne({
        where: { id: created.supplier.supplierProfileId },
      });
    }
    if (!profile) {
      throw new BadRequestException(
        'Could not resolve a supplier profile for the target owner.',
      );
    }

    // Don't double-provision (and double-credit the partner) for a supplier
    // that is already live — whether it was funded earlier or self-activated
    // via Ebirr. activateForFundedFlow is idempotent on the subscription, but
    // this method would still write a second activation + CREDIT_APPLIED entry.
    if (profile.activationStatus === SupplierActivationStatus.ACTIVE) {
      throw new BadRequestException(
        `Supplier #${profile.id} is already active; it cannot be BNPL-funded again.`,
      );
    }
    const existingActivation = await this.activationsRepo.findOne({
      where: {
        supplierProfileId: profile.id,
        status: In([
          EquityPartnerBnplStatus.OUTSTANDING,
          EquityPartnerBnplStatus.SETTLED,
        ]),
      },
    });
    if (existingActivation) {
      throw new BadRequestException(
        `Supplier #${profile.id} already has a BNPL activation (#${existingActivation.id}); cannot fund it again.`,
      );
    }

    // Provision the supplier subscription ACTIVE immediately.
    const subscription =
      await this.supplierActivationService.activateForFundedFlow(
        profile.id,
        option.period,
        {
          fundingMode: isDirect ? 'DIRECT_EBIRR' : 'EQUITY_BNPL',
          equityPartnerId: partner.id,
        },
      );

    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setMonth(endsAt.getMonth() + option.months);

    const activation = await this.activationsRepo.save(
      this.activationsRepo.create({
        equityPartnerId: partner.id,
        accountKind: 'SUPPLIER',
        branchId: null,
        supplierProfileId: profile.id,
        tenantSubscriptionId: null,
        targetOwnerUserId: targetUser.id,
        period: option.period,
        amountDue: grossAmount,
        equityCreditAmount,
        settlementAmountDue,
        currency: option.currency,
        status: EquityPartnerBnplStatus.OUTSTANDING,
        dueAt: endsAt,
        metadata: {
          targetOwnerEmail: input.targetOwnerEmail,
          targetOwnerWasCreated: targetUser.requiresGoogleLink === true,
          fundingMode: isDirect ? 'DIRECT_EBIRR' : 'EQUITY_BNPL',
          settlementModel: isDirect ? 'DIRECT_PAYMENT' : 'NET_OF_EQUITY_CREDIT',
          supplierCompanyName: profile.companyName,
          supplierSubscriptionId: subscription?.id ?? null,
        },
      }),
    );

    this.logger.log(
      `Equity partner ${partner.id} ${
        isDirect ? 'direct-paid' : 'BNPL-funded'
      } supplier #${profile.id} for user ${targetUser.id}; due ${endsAt.toISOString()}`,
    );

    await this.ensureCreditLedgerEntry(activation);

    if (isDirect) {
      const { payment } = await this.chargeActivationViaEbirr(
        activation,
        String(input.paymentPhone),
      );
      return Object.assign(activation, { payment });
    }

    return activation;
  }

  async listOutstandingForPartner(
    partnerUserId: number,
  ): Promise<
    Array<
      EquityPartnerBnplActivation & { branchName: string; displayName: string }
    >
  > {
    const partner = await this.requireActivePartnerForUser(partnerUserId);
    const activations = await this.activationsRepo.find({
      where: { equityPartnerId: partner.id },
      order: { createdAt: 'DESC' },
    });
    if (!activations.length) {
      return [];
    }

    return this.attachDisplayNames(activations);
  }

  async listCreditLedgerForPartner(
    partnerUserId: number,
  ): Promise<
    Array<EquityPartnerBnplCreditLedgerEntry & { branchName: string }>
  > {
    const partner = await this.requireActivePartnerForUser(partnerUserId);
    const entries = await this.creditLedgerRepo.find({
      where: { equityPartnerId: partner.id },
      order: { createdAt: 'DESC' },
    });
    return this.attachDisplayNames(entries);
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

    const { referenceId, response } = await this.chargeActivationViaEbirr(
      activation,
      phoneNumber,
    );
    return { referenceId, response };
  }

  /**
   * Charge an activation's amount due via Ebirr and stamp the attempt onto the
   * activation + credit-ledger. Shared by the partner-initiated settlement and
   * the DIRECT_EBIRR activation path. On payment confirmation the existing Ebirr
   * webhook (keyed on the `BNPLACT-<id>` reference) flips the row to SETTLED.
   */
  private async chargeActivationViaEbirr(
    activation: EquityPartnerBnplActivation,
    phoneNumber: string,
  ): Promise<{
    referenceId: string;
    payment: {
      checkoutUrl: string | null;
      receiveCode: string | null;
      providerMessage: string;
    };
    response: unknown;
  }> {
    const referenceId = `${BNPL_REFERENCE_PREFIX}-${activation.id}-${Date.now()}`;
    const invoiceId = `${BNPL_REFERENCE_PREFIX}INV-${activation.id}`;
    const amountDue =
      Number(activation.settlementAmountDue) > 0
        ? Number(activation.settlementAmountDue)
        : Number(activation.amountDue);
    const target =
      activation.accountKind === 'SUPPLIER'
        ? `supplier #${activation.supplierProfileId}`
        : `branch ${activation.branchId}`;

    const response = await this.ebirrService.initiatePayment({
      phoneNumber,
      amount: amountDue.toFixed(2),
      referenceId,
      invoiceId,
      description: `Equity partner activation payment for ${target}`,
    });

    activation.settlementReferenceId = referenceId;
    activation.metadata = {
      ...(activation.metadata ?? {}),
      lastSettlementAttempt: {
        referenceId,
        grossAmount: Number(activation.amountDue),
        equityCreditAmount: Number(activation.equityCreditAmount || 0),
        settlementAmountDue: amountDue,
        startedAt: new Date().toISOString(),
      },
    };
    await this.activationsRepo.save(activation);
    await this.syncCreditLedgerEntry(activation, {
      settlementReferenceId: referenceId,
    });

    return {
      referenceId,
      payment: this.normalizeEbirrResponse(response),
      response,
    };
  }

  /** Normalize an Ebirr initiate-payment response to the checkout shape the
   *  partner UI renders (mirrors SupplierActivationService). */
  private normalizeEbirrResponse(paymentResponse: any): {
    checkoutUrl: string | null;
    receiveCode: string | null;
    providerMessage: string;
  } {
    const rawCheckoutUrl =
      typeof paymentResponse?.toPayUrl === 'string'
        ? paymentResponse.toPayUrl.trim()
        : null;
    const checkoutUrl =
      rawCheckoutUrl && /^https?:\/\//i.test(rawCheckoutUrl)
        ? rawCheckoutUrl
        : null;
    const receiveCode =
      typeof paymentResponse?.receiverCode === 'string' &&
      paymentResponse.receiverCode.trim()
        ? paymentResponse.receiverCode.trim()
        : typeof paymentResponse?.ussd === 'string' &&
            paymentResponse.ussd.trim()
          ? paymentResponse.ussd.trim()
          : null;
    const providerMessage =
      typeof paymentResponse?.responseMsg === 'string'
        ? paymentResponse.responseMsg
        : typeof paymentResponse?.message === 'string'
          ? paymentResponse.message
          : checkoutUrl || receiveCode
            ? 'Confirm the payment in Ebirr, then return to the portal.'
            : 'Confirm the payment request in Ebirr on the selected mobile line.';
    return { checkoutUrl, receiveCode, providerMessage };
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

  async listCreditLedgerForPartnerAdmin(
    partnerId: number,
  ): Promise<
    Array<EquityPartnerBnplCreditLedgerEntry & { branchName: string }>
  > {
    const entries = await this.creditLedgerRepo.find({
      where: { equityPartnerId: partnerId },
      order: { createdAt: 'DESC' },
    });
    return this.attachDisplayNames(entries);
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

  async cancelBnplActivation(
    partnerUserId: number,
    activationId: number,
  ): Promise<EquityPartnerBnplActivation> {
    const partner = await this.requireActivePartnerForUser(partnerUserId);

    const activation = await this.activationsRepo.findOne({
      where: { id: activationId, equityPartnerId: partner.id },
    });
    if (!activation) {
      throw new NotFoundException(
        `BNPL activation #${activationId} not found.`,
      );
    }
    if (activation.status !== EquityPartnerBnplStatus.OUTSTANDING) {
      throw new BadRequestException(
        `Activation #${activationId} cannot be cancelled — it is already ${activation.status}.`,
      );
    }

    activation.status = EquityPartnerBnplStatus.CANCELLED;
    activation.settledAt = new Date();
    activation.metadata = {
      ...(activation.metadata ?? {}),
      cancelledAt: new Date().toISOString(),
    };
    const saved = await this.activationsRepo.save(activation);
    await this.syncCreditLedgerEntry(saved);
    this.logger.log(
      `Partner #${partner.id} cancelled BNPL activation #${activationId}.`,
    );
    return saved;
  }

  /** Admin-initiated cancel — no partner-user ownership check. */
  async cancelForAdmin(
    activationId: number,
  ): Promise<EquityPartnerBnplActivation> {
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
        `Activation #${activationId} cannot be cancelled — it is already ${activation.status}.`,
      );
    }
    activation.status = EquityPartnerBnplStatus.CANCELLED;
    activation.settledAt = new Date();
    activation.metadata = {
      ...(activation.metadata ?? {}),
      cancelledAt: new Date().toISOString(),
      cancelledBy: 'admin',
    };
    const saved = await this.activationsRepo.save(activation);
    await this.syncCreditLedgerEntry(saved);
    this.logger.log(`Admin cancelled BNPL activation #${activationId}.`);
    return saved;
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
    const saved = await this.activationsRepo.save(activation);
    await this.syncCreditLedgerEntry(saved);
    return saved;
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
    const saved = await this.activationsRepo.save(activation);
    await this.syncCreditLedgerEntry(saved);
    return saved;
  }

  /**
   * True when an Ebirr reference belongs to an equity-partner BNPL activation
   * (a DIRECT_EBIRR activation or a partner-initiated settlement). The Ebirr
   * callback handler uses this to route confirmed payments to settlement.
   */
  isBnplActivationReference(referenceId: string | null | undefined): boolean {
    return new RegExp(`^${BNPL_REFERENCE_PREFIX}-\\d+-`).test(
      String(referenceId || '').trim(),
    );
  }

  /**
   * Settle the activation a `BNPLACT-<id>-<ts>` reference points at, on Ebirr
   * payment confirmation. Idempotent (markSettled no-ops once SETTLED), so the
   * webhook and the return-redirect can both call it safely.
   */
  async completeEbirrSettlement(
    referenceId: string,
  ): Promise<EquityPartnerBnplActivation | null> {
    const match = new RegExp(`^${BNPL_REFERENCE_PREFIX}-(\\d+)-`).exec(
      String(referenceId || '').trim(),
    );
    if (!match) {
      this.logger.warn(
        `Ignoring unsupported BNPL settlement reference: ${referenceId}`,
      );
      return null;
    }
    const activationId = Number(match[1]);
    if (!Number.isInteger(activationId) || activationId <= 0) {
      return null;
    }
    return this.markSettled(activationId, String(referenceId).trim());
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Pricing table exposed to the partner UI. BNPL funds the yearly plan only
   *  (monthly BNPL is trivial — credit ≈ settlement), so the monthly option is
   *  filtered out here and rejected by the controller DTO. */
  getSubscriptionOptions(kind: EquityPartnerBnplAccountKind = 'BRANCH') {
    const source =
      kind === 'SUPPLIER'
        ? SUPPLIER_SUBSCRIPTION_OPTIONS
        : POS_BRANCH_SUBSCRIPTION_OPTIONS;
    return source
      .filter((option) => option.period === 'ONE_YEAR')
      .map((option) => ({
        period: option.period,
        months: option.months,
        amount: option.amount,
        equityCreditAmount: this.calculateEquityCreditAmount(option.amount),
        settlementAmountDue: Math.max(
          0,
          option.amount - this.calculateEquityCreditAmount(option.amount),
        ),
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

  /**
   * SUPER_ADMINs activate with unlimited slots and need no application. Reuse
   * their existing partner record (activating it if dormant) or auto-provision a
   * minimal ACTIVE one so activations have a partner to attach to. bnplCreditLimit
   * is irrelevant — the capacity gate is skipped for super-admins.
   */
  private async resolveSuperAdminPartner(
    userId: number,
  ): Promise<EquityPartner> {
    let partner = await this.partnersRepo.findOne({ where: { userId } });
    if (!partner) {
      const user = await this.usersRepo.findOne({ where: { id: userId } });
      partner = await this.partnersRepo.save(
        this.partnersRepo.create({
          userId,
          displayName:
            user?.displayName || user?.email || `Platform Admin #${userId}`,
          phone: String((user as any)?.phone || '').trim() || 'N/A',
          status: EquityPartnerStatus.ACTIVE,
          bnplCreditLimit: 0,
        }),
      );
      this.logger.log(
        `Auto-provisioned equity partner #${partner.id} for SUPER_ADMIN user ${userId}.`,
      );
    } else if (partner.status !== EquityPartnerStatus.ACTIVE) {
      partner.status = EquityPartnerStatus.ACTIVE;
      partner = await this.partnersRepo.save(partner);
    }
    return partner;
  }

  private async assertCreditCapacity(partner: EquityPartner) {
    // Direct (Ebirr-paid) activations don't draw the credit line, so exclude
    // them from the outstanding-slot count.
    const outstanding = await this.activationsRepo.count({
      where: {
        equityPartnerId: partner.id,
        status: EquityPartnerBnplStatus.OUTSTANDING,
        metadata: Raw(
          (alias) =>
            `COALESCE(${alias}->>'fundingMode', 'EQUITY_BNPL') <> 'DIRECT_EBIRR'`,
        ),
      },
    });
    if (outstanding >= partner.bnplCreditLimit) {
      throw new BadRequestException(
        `BNPL credit limit reached (${outstanding}/${partner.bnplCreditLimit}). Settle an existing activation before creating another, or pay directly via Ebirr.`,
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

    // Use a previously cached tenant — this survives branch transfers.
    if (partner.hostRetailTenantId) {
      return partner.hostRetailTenantId;
    }

    const ownedBranch = await this.branchesRepo.findOne({
      where: { ownerId: partner.userId, isActive: true },
      select: ['id', 'retailTenantId'],
    });
    if (ownedBranch?.retailTenantId) {
      // Persist so future activations don't depend on branch ownership.
      await this.partnersRepo.update(partner.id, {
        hostRetailTenantId: ownedBranch.retailTenantId,
      });
      return ownedBranch.retailTenantId;
    }

    // Partner has no existing branch — provision a host tenant on first activation.
    const newTenant = await this.retailTenantsRepo.save(
      this.retailTenantsRepo.create({
        name: `${partner.displayName} (Equity)`,
        ownerUserId: partner.userId,
        status: RetailTenantStatus.ACTIVE,
      }),
    );
    await this.partnersRepo.update(partner.id, {
      hostRetailTenantId: newTenant.id,
    });
    return newTenant.id;
  }

  private calculateEquityCreditAmount(grossAmount: number): number {
    const splitNumerator = Number(EQUITY_PRICING.splitNumerator) || 0;
    const splitDenominator = Number(EQUITY_PRICING.splitDenominator) || 0;

    if (splitNumerator <= 0 || splitDenominator <= 0) {
      return 0;
    }

    return Math.floor(
      (Number(grossAmount) * splitNumerator) / splitDenominator,
    );
  }

  private async ensureCreditLedgerEntry(
    activation: EquityPartnerBnplActivation,
  ): Promise<EquityPartnerBnplCreditLedgerEntry> {
    const existing = await this.creditLedgerRepo.findOne({
      where: { bnplActivationId: activation.id },
    });
    if (existing) {
      return this.syncCreditLedgerEntry(activation);
    }

    const entry = this.creditLedgerRepo.create({
      equityPartnerId: activation.equityPartnerId,
      bnplActivationId: activation.id,
      accountKind: activation.accountKind ?? 'BRANCH',
      branchId: activation.branchId ?? null,
      supplierProfileId: activation.supplierProfileId ?? null,
      targetOwnerUserId: activation.targetOwnerUserId,
      period: activation.period,
      entryType: EquityPartnerBnplCreditLedgerEntryType.CREDIT_APPLIED,
      grossAmount: Number(activation.amountDue),
      equityCreditAmount: Number(activation.equityCreditAmount || 0),
      settlementAmountDue: Number(
        activation.settlementAmountDue ?? activation.amountDue,
      ),
      currency: activation.currency,
      activationStatus: activation.status,
      settlementReferenceId: activation.settlementReferenceId ?? null,
      metadata: {
        targetOwnerEmail: activation.metadata?.targetOwnerEmail ?? null,
        settlementModel: activation.metadata?.settlementModel ?? null,
      },
    });
    return this.creditLedgerRepo.save(entry);
  }

  private async syncCreditLedgerEntry(
    activation: EquityPartnerBnplActivation,
    overrides: { settlementReferenceId?: string | null } = {},
  ): Promise<EquityPartnerBnplCreditLedgerEntry> {
    const entry = await this.creditLedgerRepo.findOne({
      where: { bnplActivationId: activation.id },
    });

    if (!entry) {
      return this.ensureCreditLedgerEntry({
        ...activation,
        settlementReferenceId:
          overrides.settlementReferenceId ?? activation.settlementReferenceId,
      });
    }

    entry.activationStatus = activation.status;
    entry.settlementReferenceId =
      overrides.settlementReferenceId ??
      activation.settlementReferenceId ??
      null;
    entry.metadata = {
      ...(entry.metadata ?? {}),
      targetOwnerEmail:
        activation.metadata?.targetOwnerEmail ??
        entry.metadata?.targetOwnerEmail ??
        null,
      settlementModel:
        activation.metadata?.settlementModel ??
        entry.metadata?.settlementModel ??
        null,
    };
    return this.creditLedgerRepo.save(entry);
  }

  private async findOrCreateTargetOwner(
    rawEmail: string,
    opts: { isSuperAdmin?: boolean } = {},
  ): Promise<
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
      // A regular partner must not be able to provision/attach an equity-funded
      // account onto a platform-staff account they don't control. Super-admins
      // (the admin tooling path) are unrestricted. NOTE: broader consent policy
      // for arbitrary brand-new emails is a product decision left open here.
      if (!opts.isSuperAdmin) {
        const targetRoles = Array.isArray(existing.roles) ? existing.roles : [];
        const privilegedRoles = [UserRole.SUPER_ADMIN, UserRole.ADMIN];
        if (targetRoles.some((role) => privilegedRoles.includes(role))) {
          throw new ForbiddenException(
            'You are not allowed to provision an account for this email address.',
          );
        }
      }
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
    return created;
  }

  /**
   * Resolve a human label for each row regardless of what was funded: a branch
   * name for accountKind='BRANCH', a supplier company name for 'SUPPLIER'.
   * `branchName` is kept (mirrors `displayName`) so existing branch-only callers
   * stay backward-compatible.
   */
  private async attachDisplayNames<
    T extends {
      accountKind?: EquityPartnerBnplAccountKind;
      branchId?: number | null;
      supplierProfileId?: number | null;
    },
  >(
    rows: T[],
  ): Promise<Array<T & { branchName: string; displayName: string }>> {
    if (!rows.length) {
      return [];
    }

    const branchIds = rows
      .map((row) => row.branchId)
      .filter((id): id is number => Number(id) > 0);
    const supplierIds = rows
      .map((row) => row.supplierProfileId)
      .filter((id): id is number => Number(id) > 0);

    const branches = branchIds.length
      ? await this.branchesRepo.find({
          where: { id: In(branchIds) },
          select: ['id', 'name'],
        })
      : [];
    const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

    const suppliers = supplierIds.length
      ? await this.supplierProfilesRepo.find({
          where: { id: In(supplierIds) },
          select: ['id', 'companyName'],
        })
      : [];
    const supplierNameById = new Map(
      suppliers.map((s) => [s.id, s.companyName]),
    );

    return rows.map((row) => {
      const isSupplier =
        row.accountKind === 'SUPPLIER' || Number(row.supplierProfileId) > 0;
      const displayName = isSupplier
        ? supplierNameById.get(Number(row.supplierProfileId)) ||
          `Supplier #${row.supplierProfileId}`
        : branchNameById.get(Number(row.branchId)) || `Branch #${row.branchId}`;
      return { ...row, branchName: displayName, displayName };
    });
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
