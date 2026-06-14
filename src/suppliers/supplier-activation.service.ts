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
import {
  SUPPLIER_SUBSCRIPTION_OPTIONS,
  SupplierSubscriptionOption,
  SupplierSubscriptionPeriod,
  findSupplierSubscriptionOption,
  requireSupplierSubscriptionOption,
} from './supplier-subscription-pricing';

const SUPPLIER_ACTIVATION_REFERENCE_PREFIX = 'SUPACT';
export { SUPPLIER_ACTIVATION_REFERENCE_PREFIX };
const DEFAULT_SUPPLIER_PERIOD: SupplierSubscriptionPeriod = 'MONTHLY';

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
    @InjectRepository(SupplierProfile)
    private readonly profilesRepository: Repository<SupplierProfile>,
    @InjectRepository(SupplierSubscription)
    private readonly subscriptionsRepository: Repository<SupplierSubscription>,
  ) {}

  listSubscriptionOptions(): readonly SupplierSubscriptionOption[] {
    return SUPPLIER_SUBSCRIPTION_OPTIONS;
  }

  isSupplierActivationReference(referenceId: string | null | undefined) {
    return String(referenceId || '').startsWith(
      `${SUPPLIER_ACTIVATION_REFERENCE_PREFIX}-`,
    );
  }

  async startEbirrActivationPayment(
    user: { id: number; roles?: string[] },
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

    const profile = await this.profilesRepository.findOne({
      where: { id: supplierProfileId },
    });
    if (!profile) {
      throw new NotFoundException(
        `Supplier profile ${supplierProfileId} not found for activation.`,
      );
    }

    const latest = await this.subscriptionsRepository.findOne({
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
    const saved = await this.subscriptionsRepository.save(next);

    profile.activationStatus = SupplierActivationStatus.ACTIVE;
    profile.lastActivatedAt = now;
    await this.profilesRepository.save(profile);

    this.logger.log(
      `Activated supplier #${supplierProfileId} (${option.planCode}) via ${referenceId}`,
    );
    return saved;
  }

  /** Lightweight activation/subscription state for the billing page. */
  async getActivationState(user: { id: number; roles?: string[] }) {
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
