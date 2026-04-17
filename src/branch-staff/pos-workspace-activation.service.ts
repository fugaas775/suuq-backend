import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchStaffService } from './branch-staff.service';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { EbirrService } from '../ebirr/ebirr.service';
import { BranchStaffRole } from './entities/branch-staff-assignment.entity';
import {
  TenantBillingInterval,
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import {
  RetailModule,
  TenantModuleEntitlement,
} from '../retail/entities/tenant-module-entitlement.entity';

const POS_WORKSPACE_PLAN_CODE = 'POS_BRANCH';
const POS_WORKSPACE_REFERENCE_PREFIX = 'POSACT';
const POS_WORKSPACE_MONTHLY_PRICE = 1900;
const POS_WORKSPACE_CURRENCY = 'ETB';
const POS_WORKSPACE_TRIAL_LENGTH_DAYS = 15;
export const PRIMARY_RETAIL_CATEGORY_BLOCKER =
  'Choose a primary retail category.';
export const POS_FIT_CATEGORY_BLOCKER = 'Choose a POS fit category.';

@Injectable()
export class PosWorkspaceActivationService {
  private readonly logger = new Logger(PosWorkspaceActivationService.name);

  constructor(
    private readonly branchStaffService: BranchStaffService,
    private readonly retailEntitlementsService: RetailEntitlementsService,
    private readonly ebirrService: EbirrService,
    @InjectRepository(TenantSubscription)
    private readonly tenantSubscriptionsRepository: Repository<TenantSubscription>,
    @InjectRepository(TenantModuleEntitlement)
    private readonly tenantModuleEntitlementsRepository: Repository<TenantModuleEntitlement>,
  ) {}

  async startEbirrActivationPayment(
    user: { id: number; roles?: string[] },
    params: { branchId: number; phoneNumber: string },
  ) {
    const candidate = await this.getPayableActivationCandidate(
      user,
      params.branchId,
    );
    const referenceId = `${POS_WORKSPACE_REFERENCE_PREFIX}-${candidate.branchId}-${Date.now()}`;
    const invoiceId = `${POS_WORKSPACE_REFERENCE_PREFIX}INV-${candidate.branchId}`;
    const paymentResponse = await this.ebirrService.initiatePayment({
      phoneNumber: params.phoneNumber,
      amount: POS_WORKSPACE_MONTHLY_PRICE.toFixed(2),
      referenceId,
      invoiceId,
      description: `POS workspace activation for ${candidate.branchName}`,
    });

    const rawCheckoutUrl =
      paymentResponse?.toPayUrl && typeof paymentResponse.toPayUrl === 'string'
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
            ? 'Confirm the payment in Ebirr, then return to POS-S.'
            : 'Confirm the payment request in Ebirr on the selected mobile line.';

    const approvedImmediately =
      paymentResponse?.errorCode === '0' &&
      paymentResponse?.params?.state === 'APPROVED';

    if (approvedImmediately) {
      await this.completeEbirrActivationPayment(referenceId);
    }

    return {
      branchId: candidate.branchId,
      branchName: candidate.branchName,
      referenceId,
      status: approvedImmediately ? 'ACTIVE' : 'PENDING_CONFIRMATION',
      checkoutUrl,
      receiveCode,
      providerMessage,
    };
  }

  async startTrialActivation(
    user: { id: number; roles?: string[] },
    params: { branchId: number; serviceFormat?: string | null },
  ) {
    const candidate = await this.getTrialEligibleActivationCandidate(
      user,
      params.branchId,
    );
    const workspace =
      await this.retailEntitlementsService.getBranchWorkspaceStatus(
        candidate.branchId,
      );

    if (!workspace.tenant) {
      throw new NotFoundException(
        `Branch ${candidate.branchId} is not linked to a retail tenant for POS activation.`,
      );
    }

    this.assertTenantGovernanceReady(workspace, {
      serviceFormat:
        params.serviceFormat ||
        candidate.serviceFormat ||
        workspace.branch?.serviceFormat,
    });

    const hasPosCore = workspace.entitlements.some(
      (entitlement) => entitlement.module === RetailModule.POS_CORE,
    );

    if (!hasPosCore) {
      throw new ForbiddenException(
        `Branch ${candidate.branchId} is missing POS_CORE entitlement for activation.`,
      );
    }

    const now = new Date();
    const trialEndsAt = new Date(
      now.getTime() + POS_WORKSPACE_TRIAL_LENGTH_DAYS * 86_400_000,
    );
    const latestSubscription = await this.tenantSubscriptionsRepository.findOne(
      {
        where: { tenantId: workspace.tenant.id },
        order: { createdAt: 'DESC' },
      },
    );
    const nextSubscription =
      latestSubscription ??
      this.tenantSubscriptionsRepository.create({
        tenantId: workspace.tenant.id,
      });

    nextSubscription.planCode = POS_WORKSPACE_PLAN_CODE;
    nextSubscription.status = TenantSubscriptionStatus.TRIAL;
    nextSubscription.billingInterval = TenantBillingInterval.MONTHLY;
    nextSubscription.amount = POS_WORKSPACE_MONTHLY_PRICE;
    nextSubscription.currency = POS_WORKSPACE_CURRENCY;
    nextSubscription.startsAt = now;
    nextSubscription.endsAt = trialEndsAt;
    nextSubscription.autoRenew = false;
    nextSubscription.metadata = {
      ...(latestSubscription?.metadata || {}),
      lastActivationPaymentMethod: 'TRIAL',
      lastActivatedAt: now.toISOString(),
      posWorkspacePlanCode: POS_WORKSPACE_PLAN_CODE,
      branchId: candidate.branchId,
      trialStartedAt: now.toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
      trialDays: POS_WORKSPACE_TRIAL_LENGTH_DAYS,
      hasUsedTrial: true,
    };

    await this.tenantSubscriptionsRepository.save(nextSubscription);

    return {
      branchId: candidate.branchId,
      branchName: candidate.branchName,
      status: 'TRIAL' as const,
      trialStartedAt: now.toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
      trialDaysRemaining: POS_WORKSPACE_TRIAL_LENGTH_DAYS,
      serviceFormat: this.normalizeServiceFormat(
        params.serviceFormat ||
          candidate.serviceFormat ||
          workspace.branch?.serviceFormat,
      ),
      providerMessage: `The 15-day trial is active. The first monthly charge should begin on ${this.formatDisplayDate(trialEndsAt)}.`,
    };
  }

  async completeEbirrActivationPayment(referenceId: string) {
    const branchId = this.parseBranchIdFromReference(referenceId);
    if (!branchId) {
      this.logger.warn(
        `Ignoring unsupported POS activation reference: ${referenceId}`,
      );
      return null;
    }

    const workspace =
      await this.retailEntitlementsService.getBranchWorkspaceStatus(branchId);

    if (!workspace.tenant) {
      throw new NotFoundException(
        `Branch ${branchId} is not linked to a retail tenant for POS activation.`,
      );
    }

    this.assertTenantGovernanceReady(workspace, {
      serviceFormat: workspace.branch?.serviceFormat,
    });

    const hasPosCore = workspace.entitlements.some(
      (entitlement) => entitlement.module === RetailModule.POS_CORE,
    );

    if (!hasPosCore) {
      throw new ForbiddenException(
        `Branch ${branchId} is missing POS_CORE entitlement for activation.`,
      );
    }

    const latestSubscription = await this.tenantSubscriptionsRepository.findOne(
      {
        where: { tenantId: workspace.tenant.id },
        order: { createdAt: 'DESC' },
      },
    );

    if (latestSubscription?.status === TenantSubscriptionStatus.ACTIVE) {
      return latestSubscription;
    }

    const now = new Date();
    const nextSubscription =
      latestSubscription ??
      this.tenantSubscriptionsRepository.create({
        tenantId: workspace.tenant.id,
      });

    nextSubscription.planCode =
      latestSubscription?.planCode?.trim() || POS_WORKSPACE_PLAN_CODE;
    nextSubscription.status = TenantSubscriptionStatus.ACTIVE;
    nextSubscription.billingInterval = TenantBillingInterval.MONTHLY;
    nextSubscription.amount = POS_WORKSPACE_MONTHLY_PRICE;
    nextSubscription.currency = POS_WORKSPACE_CURRENCY;
    nextSubscription.startsAt = latestSubscription?.startsAt ?? now;
    nextSubscription.endsAt = null;
    nextSubscription.autoRenew = true;
    nextSubscription.metadata = {
      ...(latestSubscription?.metadata || {}),
      lastActivationReferenceId: referenceId,
      lastActivationPaymentMethod: 'EBIRR',
      lastActivatedAt: now.toISOString(),
      posWorkspacePlanCode: POS_WORKSPACE_PLAN_CODE,
      branchId,
    };

    return this.tenantSubscriptionsRepository.save(nextSubscription);
  }

  isPosWorkspaceActivationReference(referenceId: string | null | undefined) {
    return String(referenceId || '').startsWith(
      `${POS_WORKSPACE_REFERENCE_PREFIX}-`,
    );
  }

  private parseBranchIdFromReference(referenceId: string): number | null {
    const match = String(referenceId || '').match(/^POSACT-(\d+)-/u);
    if (!match?.[1]) {
      return null;
    }

    const branchId = Number.parseInt(match[1], 10);
    return Number.isInteger(branchId) && branchId > 0 ? branchId : null;
  }

  private async getPayableActivationCandidate(
    user: { id: number; roles?: string[] },
    branchId: number,
  ) {
    const candidates =
      await this.branchStaffService.getPosWorkspaceActivationCandidatesForUser(
        user,
      );
    const candidate = candidates.find((entry) => entry.branchId === branchId);

    if (!candidate) {
      throw new NotFoundException(
        `Branch ${branchId} is not available for POS activation for this account.`,
      );
    }

    if (!candidate.isOwner && candidate.role !== BranchStaffRole.MANAGER) {
      throw new ForbiddenException(
        'Only a branch owner or manager can activate POS billing for this workspace.',
      );
    }

    const payableStatuses = new Set([
      'PAYMENT_REQUIRED',
      'PAST_DUE',
      'EXPIRED',
      'CANCELLED',
    ]);

    if (!payableStatuses.has(candidate.workspaceStatus)) {
      throw new ForbiddenException(
        `Branch ${branchId} cannot start payment while workspace status is ${candidate.workspaceStatus}.`,
      );
    }

    if (!candidate.retailTenantId) {
      throw new ForbiddenException(
        `Branch ${branchId} is not linked to a retail tenant for POS activation.`,
      );
    }

    const workspace =
      await this.retailEntitlementsService.getBranchWorkspaceStatus(branchId);

    this.assertTenantGovernanceReady(workspace, {
      serviceFormat: candidate.serviceFormat || workspace.branch?.serviceFormat,
    });

    const posEntitlement =
      await this.tenantModuleEntitlementsRepository.findOne({
        where: {
          tenantId: candidate.retailTenantId,
          module: RetailModule.POS_CORE,
        },
      });

    if (!posEntitlement?.enabled) {
      throw new ForbiddenException(
        'POS_CORE entitlement must be enabled before payment can be collected for this branch workspace.',
      );
    }

    return candidate;
  }

  private normalizeServiceFormat(value?: string | null) {
    const normalized = String(value || '')
      .trim()
      .toUpperCase();

    if (!normalized) {
      return null;
    }

    if (!['RETAIL', 'CAFETERIA', 'QSR', 'FSR'].includes(normalized)) {
      return null;
    }

    return normalized;
  }

  private assertTenantGovernanceReady(
    workspace: {
      branch?: { serviceFormat?: string | null };
      governance?: {
        activationReadiness?: { canActivate?: boolean; blockers?: string[] };
      } | null;
    },
    options: { serviceFormat?: string | null } = {},
  ) {
    if (workspace.governance?.activationReadiness?.canActivate) {
      return;
    }

    const hasServiceFormat = Boolean(
      this.normalizeServiceFormat(
        options.serviceFormat || workspace.branch?.serviceFormat || null,
      ),
    );
    const blockers = (
      workspace.governance?.activationReadiness?.blockers || []
    ).filter(
      (blocker) =>
        !(
          hasServiceFormat &&
          (blocker === PRIMARY_RETAIL_CATEGORY_BLOCKER ||
            blocker === POS_FIT_CATEGORY_BLOCKER)
        ),
    );

    if (blockers.length === 0) {
      return;
    }

    const blockerMessage =
      blockers[0] ||
      'Tenant governance setup is incomplete for POS activation.';

    throw new ForbiddenException(blockerMessage);
  }

  private async getTrialEligibleActivationCandidate(
    user: { id: number; roles?: string[] },
    branchId: number,
  ) {
    const candidates =
      await this.branchStaffService.getPosWorkspaceActivationCandidatesForUser(
        user,
      );
    const candidate = candidates.find((entry) => entry.branchId === branchId);

    if (!candidate) {
      throw new NotFoundException(
        `Branch ${branchId} is not available for POS activation for this account.`,
      );
    }

    if (!candidate.canStartTrial) {
      throw new ForbiddenException(
        `Branch ${branchId} is not eligible for a POS workspace trial.`,
      );
    }

    return candidate;
  }

  private formatDisplayDate(value: Date) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(value);
  }
}
