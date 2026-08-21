import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EbirrService } from '../ebirr/ebirr.service';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import {
  SupplierActivationStatus,
  SupplierProfile,
} from './entities/supplier-profile.entity';
import { SupplierSubscription } from './entities/supplier-subscription.entity';
import { SupplierStaffService } from './supplier-staff.service';
import { SupplierOutletService } from './supplier-outlet.service';
import {
  SUPPLIER_SUBSCRIPTION_OPTIONS,
  SupplierSubscriptionOption,
  SupplierSubscriptionPeriod,
  findSupplierSubscriptionOption,
  requireSupplierSubscriptionOption,
} from './supplier-subscription-pricing';
import {
  getSupplierFreePeriodEndsAt,
  isLiveSupplierFreePeriod,
  isSupplierFreePeriodOpen,
  SUPPLIER_FREE_PERIOD_PLAN_CODE,
} from './supplier-free-period.policy';
import { FreeWorkspaceGrantService } from '../free-workspace/free-workspace-grant.service';
import { FreeWorkspaceGrantKind } from '../free-workspace/entities/account-free-workspace-grant.entity';

const SUPPLIER_ACTIVATION_REFERENCE_PREFIX = 'SUPACT';
export { SUPPLIER_ACTIVATION_REFERENCE_PREFIX };
const DEFAULT_SUPPLIER_PERIOD: SupplierSubscriptionPeriod = 'MONTHLY';
// Postgres advisory-lock namespace used to serialize concurrent supplier
// activation completions (the Ebirr webhook and the return-redirect can both
// fire for the same reference) so the read-then-write activation guard below
// can't be raced into a double activation.
const SUPPLIER_ACTIVATION_LOCK_NAMESPACE = 100;

/**
 * Supplier account billing/activation — the supplier-side mirror of
 * PosWorkspaceActivationService. Deliberately leaner: no tenant/branch/
 * entitlement coupling and no equity-partner payouts (suppliers are outside
 * the equity model). Payment is the go-live gate.
 */
@Injectable()
export class SupplierActivationService {
  private readonly logger = new Logger(SupplierActivationService.name);

  constructor(
    private readonly ebirrService: EbirrService,
    private readonly supplierStaffService: SupplierStaffService,
    private readonly supplierOutletService: SupplierOutletService,
    @InjectRepository(SupplierProfile)
    private readonly profilesRepository: Repository<SupplierProfile>,
    @InjectRepository(SupplierSubscription)
    private readonly subscriptionsRepository: Repository<SupplierSubscription>,
    private readonly freeWorkspaceGrantService: FreeWorkspaceGrantService,
  ) {}

  /**
   * Provision the supplier's backing cash & carry outlet (its Suuq POS counter)
   * once the account is ACTIVE. Non-fatal: a provisioning hiccup must never block
   * the activation itself — the outlet is re-ensured idempotently on the next
   * activation/sync. Runs OUTSIDE the activation transaction so its own advisory
   * lock + transaction never nest.
   */
  private async provisionOutletSafe(supplierProfileId: number): Promise<void> {
    try {
      await this.supplierOutletService.ensureOutletForSupplier(
        supplierProfileId,
      );
    } catch (err: any) {
      this.logger.warn(
        `Supplier outlet provisioning failed for #${supplierProfileId}: ${err?.message}`,
      );
    }
  }

  listSubscriptionOptions(): readonly SupplierSubscriptionOption[] {
    return SUPPLIER_SUBSCRIPTION_OPTIONS;
  }

  isSupplierActivationReference(referenceId: string | null | undefined) {
    return String(referenceId || '').startsWith(
      `${SUPPLIER_ACTIVATION_REFERENCE_PREFIX}-`,
    );
  }

  async startEbirrActivationPayment(
    user: { id: number; roles?: string[]; supplierId?: number | null },
    params: { phoneNumber: string; subscriptionPeriod?: string | null },
  ) {
    // Only an owner/manager of a supplier account may pay to activate it.
    const profile =
      await this.supplierStaffService.requireManagedSupplierProfile(user);

    const option =
      findSupplierSubscriptionOption(params.subscriptionPeriod) ??
      requireSupplierSubscriptionOption(DEFAULT_SUPPLIER_PERIOD);
    const referenceId = `${SUPPLIER_ACTIVATION_REFERENCE_PREFIX}-${profile.id}-${Date.now()}`;
    const invoiceId = `${SUPPLIER_ACTIVATION_REFERENCE_PREFIX}INV-${profile.id}`;

    const paymentResponse = await this.ebirrService.initiatePayment({
      phoneNumber: params.phoneNumber,
      amount: option.amount.toFixed(2),
      referenceId,
      invoiceId,
      description: `Supplier subscription activation (${option.label}) for ${profile.companyName}`,
    });

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
            ? 'Confirm the payment in Ebirr, then return to the supplier portal.'
            : 'Confirm the payment request in Ebirr on the selected mobile line.';

    const approvedImmediately =
      paymentResponse?.errorCode === '0' &&
      paymentResponse?.params?.state === 'APPROVED';

    if (approvedImmediately) {
      await this.completeEbirrActivationPayment(referenceId, option.period);
    } else {
      await this.recordPendingPeriod(profile.id, option, referenceId);
    }

    return {
      supplierProfileId: profile.id,
      companyName: profile.companyName,
      referenceId,
      status: approvedImmediately ? 'ACTIVE' : 'PENDING_CONFIRMATION',
      subscriptionPeriod: option.period,
      amount: option.amount,
      currency: option.currency,
      checkoutUrl,
      receiveCode,
      providerMessage,
    };
  }

  async completeEbirrActivationPayment(
    referenceId: string,
    explicitPeriod?: SupplierSubscriptionPeriod,
  ): Promise<SupplierSubscription | null> {
    const supplierProfileId = this.parseSupplierProfileId(referenceId);
    if (!supplierProfileId) {
      this.logger.warn(
        `Ignoring unsupported supplier activation reference: ${referenceId}`,
      );
      return null;
    }

    // Serialize concurrent completions for this supplier. The advisory lock is
    // held for the transaction and covers the "no subscription row yet" case
    // too (where a row-level lock wouldn't), so the webhook and the return
    // redirect can't both pass the ACTIVE guard and double-write.
    const result = await this.subscriptionsRepository.manager.transaction(
      async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
          SUPPLIER_ACTIVATION_LOCK_NAMESPACE,
          supplierProfileId,
        ]);

        const profile = await manager.findOne(SupplierProfile, {
          where: { id: supplierProfileId },
        });
        if (!profile) {
          throw new NotFoundException(
            `Supplier profile ${supplierProfileId} not found for activation.`,
          );
        }

        const latest = await manager.findOne(SupplierSubscription, {
          where: { supplierProfileId },
          order: { createdAt: 'DESC' },
        });
        if (latest?.status === TenantSubscriptionStatus.ACTIVE) {
          return latest;
        }

        const pendingMeta = latest?.metadata?.pendingActivation as
          | { period?: string }
          | undefined;
        const resolvedPeriod: SupplierSubscriptionPeriod =
          explicitPeriod ??
          (findSupplierSubscriptionOption(pendingMeta?.period)?.period ||
            DEFAULT_SUPPLIER_PERIOD);
        const option = requireSupplierSubscriptionOption(resolvedPeriod);
        const billingInterval =
          option.period === 'ONE_YEAR'
            ? TenantBillingInterval.ONE_YEAR
            : TenantBillingInterval.MONTHLY;

        const now = new Date();
        const next =
          latest ?? this.subscriptionsRepository.create({ supplierProfileId });
        next.supplierProfileId = supplierProfileId;
        next.planCode = option.planCode;
        next.status = TenantSubscriptionStatus.ACTIVE;
        next.billingInterval = billingInterval;
        next.amount = option.amount;
        next.amountTotal = option.amount;
        next.periodMonths = option.months;
        next.currency = option.currency;
        next.startsAt = now;
        next.endsAt = new Date(now.getTime() + option.months * 30 * 86_400_000);
        next.autoRenew = true;
        next.metadata = {
          ...(latest?.metadata || {}),
          lastActivationReferenceId: referenceId,
          lastActivationPaymentMethod: 'EBIRR',
          lastActivatedAt: now.toISOString(),
          subscriptionPeriod: option.period,
          pendingActivation: undefined,
        };
        const saved = await manager.save(next);

        profile.activationStatus = SupplierActivationStatus.ACTIVE;
        profile.lastActivatedAt = now;
        await manager.save(profile);

        this.logger.log(
          `Activated supplier #${supplierProfileId} (${option.planCode}) via ${referenceId}`,
        );
        return saved;
      },
    );

    // Provision the supplier's cash & carry outlet now that it is ACTIVE
    // (idempotent; also backfills a supplier that was already ACTIVE before this
    // feature shipped). Runs after the activation transaction commits.
    if (result) {
      await this.provisionOutletSafe(supplierProfileId);
    }
    return result;
  }

  /**
   * Activate a supplier subscription that was paid for out-of-band — currently
   * an equity partner BNPL-funding the supplier go-live fee. Mirrors the
   * subscription-create + profile-ACTIVE half of completeEbirrActivationPayment,
   * but takes the profile + period directly (no Ebirr reference to parse) and
   * records the funding source in metadata. Idempotent: returns the existing
   * ACTIVE subscription if the supplier is already live.
   */
  async activateForFundedFlow(
    supplierProfileId: number,
    period: string | null | undefined,
    meta?: { fundingMode?: string; equityPartnerId?: number; reason?: string },
  ): Promise<SupplierSubscription> {
    const profile = await this.profilesRepository.findOne({
      where: { id: supplierProfileId },
    });
    if (!profile) {
      throw new NotFoundException(
        `Supplier profile ${supplierProfileId} not found for activation.`,
      );
    }

    const option =
      findSupplierSubscriptionOption(period) ??
      requireSupplierSubscriptionOption(DEFAULT_SUPPLIER_PERIOD);
    const billingInterval =
      option.period === 'ONE_YEAR'
        ? TenantBillingInterval.ONE_YEAR
        : TenantBillingInterval.MONTHLY;

    const latest = await this.subscriptionsRepository.findOne({
      where: { supplierProfileId },
      order: { createdAt: 'DESC' },
    });
    if (latest?.status === TenantSubscriptionStatus.ACTIVE) {
      // Already live — still ensure the outlet exists (backfill).
      await this.provisionOutletSafe(supplierProfileId);
      return latest;
    }

    const now = new Date();
    const next =
      latest ?? this.subscriptionsRepository.create({ supplierProfileId });
    next.supplierProfileId = supplierProfileId;
    next.planCode = option.planCode;
    next.status = TenantSubscriptionStatus.ACTIVE;
    next.billingInterval = billingInterval;
    next.amount = option.amount;
    next.amountTotal = option.amount;
    next.periodMonths = option.months;
    next.currency = option.currency;
    next.startsAt = now;
    next.endsAt = new Date(now.getTime() + option.months * 30 * 86_400_000);
    next.autoRenew = false;
    next.metadata = {
      ...(latest?.metadata || {}),
      fundingMode: meta?.fundingMode ?? 'EQUITY_BNPL',
      equityPartnerId: meta?.equityPartnerId,
      lastActivationPaymentMethod: meta?.fundingMode ?? 'EQUITY_BNPL',
      lastActivatedAt: now.toISOString(),
      subscriptionPeriod: option.period,
      pendingActivation: undefined,
    };
    const saved = await this.subscriptionsRepository.save(next);

    profile.activationStatus = SupplierActivationStatus.ACTIVE;
    profile.lastActivatedAt = now;
    await this.profilesRepository.save(profile);

    this.logger.log(
      `Funded-activated supplier #${supplierProfileId} (${option.planCode}) via ${
        meta?.fundingMode ?? 'EQUITY_BNPL'
      }`,
    );

    // Provision the supplier's cash & carry outlet now that it is ACTIVE.
    await this.provisionOutletSafe(supplierProfileId);
    return saved;
  }

  /**
   * Opens a supplier account free until the promotion's deadline, spending the
   * account's one free workspace on it.
   *
   * Returns null when the supplier is chargeable — the promotion has closed, or
   * this account already spent its slot (on another supplier profile, or on a
   * POS branch). A null answer is an ordinary outcome, not a failure: the caller
   * shows the ordinary activation paywall it would have shown anyway.
   *
   * Idempotent: a profile that already has any subscription row is left alone,
   * so re-running onboarding neither stacks free periods nor spends a slot
   * twice.
   */
  async grantFreePeriod(
    supplierProfileId: number,
    ownerUserId: number,
  ): Promise<SupplierSubscription | null> {
    const now = new Date();

    if (!isSupplierFreePeriodOpen(now.getTime())) {
      return null;
    }

    const existing = await this.subscriptionsRepository.findOne({
      where: { supplierProfileId },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      return null;
    }

    const profile = await this.profilesRepository.findOne({
      where: { id: supplierProfileId },
    });

    if (!profile) {
      throw new NotFoundException(
        `Supplier profile ${supplierProfileId} not found for free activation.`,
      );
    }

    const endsAt = getSupplierFreePeriodEndsAt();
    const grant = await this.freeWorkspaceGrantService.claim(ownerUserId, {
      kind: FreeWorkspaceGrantKind.SUPPLIER,
      planCode: SUPPLIER_FREE_PERIOD_PLAN_CODE,
      endsAt,
      supplierProfileId,
      metadata: { source: 'SUPPLIER_SELF_SERVE_FREE_PERIOD' },
    });

    if (!grant) {
      return null;
    }

    const saved = await this.subscriptionsRepository.save(
      this.subscriptionsRepository.create({
        supplierProfileId,
        planCode: SUPPLIER_FREE_PERIOD_PLAN_CODE,
        status: TenantSubscriptionStatus.TRIAL,
        billingInterval: TenantBillingInterval.MONTHLY,
        amount: 0,
        amountTotal: 0,
        currency: 'ETB',
        startsAt: now,
        endsAt,
        autoRenew: false,
        metadata: {
          source: 'SUPPLIER_SELF_SERVE_FREE_PERIOD',
          freeWorkspaceGrantId: grant.id,
        },
      }),
    );

    // ACTIVE is what every downstream gate reads — publishing offers, receiving
    // purchase orders, the outlet. The free period has to move the profile the
    // same way a payment does, or the account is "free" and unable to trade.
    profile.activationStatus = SupplierActivationStatus.ACTIVE;
    profile.lastActivatedAt = now;
    await this.profilesRepository.save(profile);

    this.logger.log(
      `Supplier #${supplierProfileId} opened on the free period until ` +
        `${endsAt.toISOString()} (user #${ownerUserId}).`,
    );

    await this.provisionOutletSafe(supplierProfileId);

    return saved;
  }

  /** Lightweight activation/subscription state for the billing page. */
  async getActivationState(user: {
    id: number;
    roles?: string[];
    supplierId?: number | null;
  }) {
    const profile =
      await this.supplierStaffService.requireManagedSupplierProfile(user);
    const subscription = await this.subscriptionsRepository.findOne({
      where: { supplierProfileId: profile.id },
      order: { createdAt: 'DESC' },
    });
    return {
      supplierProfileId: profile.id,
      activationStatus: profile.activationStatus,
      lastActivatedAt: profile.lastActivatedAt ?? null,
      // Distinct from an ACTIVE paid account: this one is live and owes nothing
      // YET. The billing page has to say so, or the owner reads "active" and is
      // surprised when the account closes on the deadline.
      freePeriod: isLiveSupplierFreePeriod(subscription)
        ? {
            planCode: subscription.planCode,
            endsAt: subscription.endsAt
              ? new Date(subscription.endsAt).toISOString()
              : null,
          }
        : null,
      subscription: subscription
        ? {
            planCode: subscription.planCode,
            status: subscription.status,
            billingInterval: subscription.billingInterval,
            amountTotal: subscription.amountTotal,
            currency: subscription.currency,
            startsAt: subscription.startsAt,
            endsAt: subscription.endsAt,
          }
        : null,
      pricing: SUPPLIER_SUBSCRIPTION_OPTIONS,
    };
  }

  private async recordPendingPeriod(
    supplierProfileId: number,
    option: SupplierSubscriptionOption,
    referenceId: string,
  ): Promise<void> {
    let latest = await this.subscriptionsRepository.findOne({
      where: { supplierProfileId },
      order: { createdAt: 'DESC' },
    });
    if (!latest) {
      // Seed a placeholder PAST_DUE row to carry the pending period across the
      // async Ebirr callback (mirrors POS stashing on the latest subscription).
      latest = this.subscriptionsRepository.create({
        supplierProfileId,
        planCode: option.planCode,
        status: TenantSubscriptionStatus.PAST_DUE,
        billingInterval:
          option.period === 'ONE_YEAR'
            ? TenantBillingInterval.ONE_YEAR
            : TenantBillingInterval.MONTHLY,
        startsAt: new Date(),
        autoRenew: false,
      });
    }
    latest.metadata = {
      ...(latest.metadata ?? {}),
      pendingActivation: {
        period: option.period,
        periodMonths: option.months,
        amountTotal: option.amount,
        currency: option.currency,
        referenceId,
      },
    };
    await this.subscriptionsRepository.save(latest);
  }

  private parseSupplierProfileId(referenceId: string): number | null {
    // SUPACT-<supplierProfileId>-<timestamp>
    const match = String(referenceId || '').match(/^SUPACT-(\d+)-/);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
}
