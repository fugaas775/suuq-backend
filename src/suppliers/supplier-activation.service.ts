import { addCalendarMonths } from '../retail/subscription-summary';
import {
  POS_EARLY_RENEWAL_WINDOW_DAYS,
  canRenewEarly,
  collectAppliedActivationReferences,
  continuesFromTermEnd,
  getPosPaidGraceDays,
  isActivationReferenceApplied,
  isLivePaidTerm,
  resolveNextTermStart,
} from '../branch-staff/pos-branch-renewal.policy';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PaymentProof,
  SubscriptionPaymentClaimsService,
} from '../subscription-payments/subscription-payment-claims.service';
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
  SUPPLIER_STARTER_OPTION,
  SupplierPaymentOption,
  SupplierPaymentPeriod,
  findSupplierPaymentOption,
  findSupplierSubscriptionOption,
  isSupplierStarterEligible,
  isSupplierStarterOption,
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
// activation completions (two approvals of one claim can arrive together) so the read-then-write activation guard below
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
    private readonly paymentClaims: SubscriptionPaymentClaimsService,
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

  /**
   * Record that the supplier has paid for a term by transfer. Grants nothing:
   * the claim goes to the admin queue and the term is created on approval.
   */
  async startActivationPayment(
    user: { id: number; roles?: string[]; supplierId?: number | null },
    params: { subscriptionPeriod?: string | null } & PaymentProof,
  ) {
    // Only an owner/manager of a supplier account may pay to activate it.
    const profile =
      await this.supplierStaffService.requireManagedSupplierProfile(user);

    const option: SupplierPaymentOption =
      findSupplierPaymentOption(params.subscriptionPeriod) ??
      requireSupplierSubscriptionOption(DEFAULT_SUPPLIER_PERIOD);

    // Refuse BEFORE charging when there is nothing to buy yet. A paid term that
    // is still running can be renewed from 30 days before its end — the new
    // term is added after it — but not earlier: money taken months ahead used
    // to be accepted here and then dropped on the floor.
    const current = await this.subscriptionsRepository.findOne({
      where: { supplierProfileId: profile.id },
      order: { createdAt: 'DESC' },
    });
    if (
      isSupplierStarterOption(option) &&
      !isSupplierStarterEligible(current)
    ) {
      throw new ConflictException(
        'The 14-day trial is for an account that has not subscribed before. Choose 1 month or 1 year.',
      );
    }
    const nowMs = Date.now();
    if (isLivePaidTerm(current, nowMs) && !canRenewEarly(current, nowMs)) {
      throw new ConflictException(
        `This subscription is paid until ${new Date(current.endsAt).toDateString()}. It can be renewed from ${POS_EARLY_RENEWAL_WINDOW_DAYS} days before that date.`,
      );
    }
    if (
      current?.status === TenantSubscriptionStatus.ACTIVE &&
      !current.endsAt
    ) {
      throw new ConflictException(
        'This subscription has no end date, so there is nothing to renew.',
      );
    }
    await this.paymentClaims.assertProofAcceptable(params, {
      kind: 'SUPPLIER',
      supplierProfileId: profile.id,
    });

    const referenceId = `${SUPPLIER_ACTIVATION_REFERENCE_PREFIX}-${profile.id}-${Date.now()}`;
    await this.recordPendingPeriod(profile.id, option, referenceId);

    const claim = await this.paymentClaims.submit({
      referenceId,
      kind: 'SUPPLIER',
      userId: user.id,
      supplierProfileId: profile.id,
      subjectName: profile.companyName,
      period: option.period,
      periodMonths: isSupplierStarterOption(option) ? null : option.months,
      amount: option.amount,
      currency: option.currency,
      channel: params.channel,
      payerReference: params.payerReference,
      payerName: params.payerName,
      receiptUrl: params.receiptUrl,
    });
    const submitted = this.paymentClaims.describeForCustomer(claim);

    return {
      ...submitted,
      supplierProfileId: profile.id,
      companyName: profile.companyName,
      subscriptionPeriod: option.period,
      checkoutUrl: null,
      receiveCode: null,
      providerMessage: submitted.message,
    };
  }

  async completeActivationPayment(
    referenceId: string,
    explicitPeriod?: SupplierPaymentPeriod,
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
        const now = new Date();
        // Has THIS payment already bought its term? Asked of the reference,
        // never of "the row says ACTIVE": a row can be active and still be owed
        // the term just paid for — a renewal made ahead of the end date, or one
        // made after the term ran out but before the midnight pass relabelled it.
        if (latest && isActivationReferenceApplied(referenceId, [latest])) {
          return latest;
        }
        // An open-ended active row has no end to extend.
        if (
          latest?.status === TenantSubscriptionStatus.ACTIVE &&
          !latest.endsAt
        ) {
          return latest;
        }

        const pendingMeta = latest?.metadata?.pendingActivation as
          | { period?: string }
          | undefined;
        const resolvedPeriod: SupplierPaymentPeriod =
          explicitPeriod ??
          (findSupplierPaymentOption(pendingMeta?.period)?.period ||
            DEFAULT_SUPPLIER_PERIOD);
        const option: SupplierPaymentOption =
          findSupplierPaymentOption(resolvedPeriod) ??
          requireSupplierSubscriptionOption(DEFAULT_SUPPLIER_PERIOD);
        const isStarter = isSupplierStarterOption(option);
        const billingInterval = isStarter
          ? TenantBillingInterval.CUSTOM
          : option.period === 'ONE_YEAR'
            ? TenantBillingInterval.ONE_YEAR
            : TenantBillingInterval.MONTHLY;

        const next =
          latest ?? this.subscriptionsRepository.create({ supplierProfileId });
        next.supplierProfileId = supplierProfileId;
        next.planCode = option.planCode;
        next.status = TenantSubscriptionStatus.ACTIVE;
        next.billingInterval = billingInterval;
        next.amount = option.amount;
        next.amountTotal = option.amount;
        // The trial is in days: no period length, so it stays out of run-rate.
        next.periodMonths = isStarter ? null : option.months;
        next.currency = option.currency;
        // A paid term still running is renewed from its END — no paid day lost.
        // In its grace days too — grace keeps the account open, it is not free.
        const graceDays = getPosPaidGraceDays();
        const renewsLiveTerm = continuesFromTermEnd(
          latest,
          now.getTime(),
          graceDays,
        );
        const termStartsAt = resolveNextTermStart(latest, now, graceDays);
        const priorReferences = latest
          ? [...collectAppliedActivationReferences([latest])]
          : [];
        // The row keeps its original start when a term is added to it, so
        // startsAt → endsAt stays the whole span that has been paid for.
        if (!renewsLiveTerm) next.startsAt = now;
        // Calendar months — a year is a year, not twelve 30-day blocks.
        next.endsAt = isStarter
          ? new Date(termStartsAt.getTime() + option.days * 86_400_000)
          : addCalendarMonths(termStartsAt, option.months);
        // Every term is paid by hand, so nothing renews by itself.
        next.autoRenew = false;
        next.metadata = {
          ...(latest?.metadata || {}),
          lastActivationReferenceId: referenceId,
          appliedActivationReferences: [...priorReferences, referenceId].slice(
            -50,
          ),
          lastTermStartsAt: termStartsAt.toISOString(),
          lastActivationPaymentMethod: 'TRANSFER',
          lastActivatedAt: now.toISOString(),
          subscriptionPeriod: option.period,
          ...(isStarter ? { starterUsedAt: now.toISOString() } : {}),
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
   * subscription-create + profile-ACTIVE half of completeActivationPayment,
   * but takes the profile + period directly (no payment reference to parse) and
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
    next.endsAt = addCalendarMonths(now, option.months);
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
      // The paid 14-day trial, while this account may still start on it.
      starter: isSupplierStarterEligible(subscription)
        ? { ...SUPPLIER_STARTER_OPTION }
        : null,
      onStarterTrial:
        subscription?.planCode === SUPPLIER_STARTER_OPTION.planCode,
      payTo: this.paymentClaims.destinations(),
      // What the supplier has reported paying, newest first — a rejected one
      // carries the reason, a submitted one is still being checked.
      payments: (await this.paymentClaims.listForSupplier(profile.id))
        .slice(0, 10)
        .map((claim) => ({
          id: claim.id,
          referenceId: claim.referenceId,
          status: claim.status,
          amount: Number(claim.amount),
          currency: claim.currency,
          channel: claim.channel,
          payerReference: claim.payerReference,
          receiptUrl: claim.receiptUrl ?? null,
          reviewNote: claim.reviewNote ?? null,
          createdAt: claim.createdAt,
        })),
    };
  }

  private async recordPendingPeriod(
    supplierProfileId: number,
    option: SupplierPaymentOption,
    referenceId: string,
  ): Promise<void> {
    let latest = await this.subscriptionsRepository.findOne({
      where: { supplierProfileId },
      order: { createdAt: 'DESC' },
    });
    if (!latest) {
      // Seed a placeholder PAST_DUE row to carry the pending period across the
      // approval of the payment claim (mirrors POS stashing on the latest subscription).
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
        periodMonths: isSupplierStarterOption(option) ? null : option.months,
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
