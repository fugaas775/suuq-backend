import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { SupplierProfile } from '../suppliers/entities/supplier-profile.entity';
import { SupplierSubscription } from '../suppliers/entities/supplier-subscription.entity';
import {
  EquityPartnerBnplActivation,
  EquityPartnerBnplStatus,
} from './entities/equity-partner-bnpl-activation.entity';
import { EquityPartner } from './entities/equity-partner.entity';
import { RetailTenant } from './entities/retail-tenant.entity';
import { TenantSubscription } from './entities/tenant-subscription.entity';
import {
  billingStateOf,
  BillingState,
  pickCurrentSubscription,
  summarizeSubscription,
  SubscriptionLike,
  SubscriptionSummary,
} from './subscription-summary';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_WINDOW_DAYS = 14;
const EXPIRING_LIST_LIMIT = 25;

export interface ExpiringAccount {
  kind: 'BRANCH' | 'SUPPLIER';
  id: number;
  name: string;
  ownerEmail: string | null;
  tenantName: string | null;
  serviceFormat: string | null;
  subscription: SubscriptionSummary;
}

/**
 * Platform-wide read model for the Suuq POS admin landing page. Everything is
 * derived from subscription and account records, not from the payment ledger,
 * so revenue figures are run-rate estimates of what is on the books.
 */
@Injectable()
export class AdminPosOverviewService {
  constructor(
    @InjectRepository(Branch)
    private readonly branches: Repository<Branch>,
    @InjectRepository(RetailTenant)
    private readonly tenants: Repository<RetailTenant>,
    @InjectRepository(TenantSubscription)
    private readonly tenantSubscriptions: Repository<TenantSubscription>,
    @InjectRepository(SupplierProfile)
    private readonly suppliers: Repository<SupplierProfile>,
    @InjectRepository(SupplierSubscription)
    private readonly supplierSubscriptions: Repository<SupplierSubscription>,
    @InjectRepository(EquityPartner)
    private readonly equityPartners: Repository<EquityPartner>,
    @InjectRepository(EquityPartnerBnplActivation)
    private readonly bnplActivations: Repository<EquityPartnerBnplActivation>,
  ) {}

  async getOverview(now: Date = new Date()) {
    const [
      branchRows,
      tenantCount,
      tenantSubs,
      supplierRows,
      supplierSubs,
      partners,
      bnpl,
    ] = await Promise.all([
      this.branches
        .createQueryBuilder('b')
        .leftJoin('b.owner', 'o')
        .leftJoin('b.retailTenant', 't')
        .select([
          'b.id',
          'b.name',
          'b.isActive',
          'b.serviceFormat',
          'b.retailTenantId',
          'b.createdAt',
          'o.id',
          'o.email',
          't.id',
          't.name',
        ])
        .getMany(),
      this.tenants.count(),
      this.tenantSubscriptions.find(),
      this.suppliers
        .createQueryBuilder('s')
        .leftJoin('s.user', 'u')
        .select([
          's.id',
          's.companyName',
          's.onboardingStatus',
          's.activationStatus',
          's.isActive',
          's.createdAt',
          'u.id',
          'u.email',
        ])
        .getMany(),
      this.supplierSubscriptions.find(),
      this.equityPartners.find({ select: { id: true, status: true } }),
      this.bnplActivations.find({
        where: { status: EquityPartnerBnplStatus.OUTSTANDING },
      }),
    ]);

    const subsByBranch = groupBy(
      tenantSubs.filter((s) => s.branchId != null),
      (s) => s.branchId,
    );
    // Legacy rows predate per-branch billing and cover the whole tenant.
    const legacyByTenant = groupBy(
      tenantSubs.filter((s) => s.branchId == null),
      (s) => s.tenantId,
    );

    const branchBilling = emptyBillingCounts();
    const formatCounts = new Map<string, number>();
    const countedSubIds = new Set<number>();
    let branchMrr = 0;
    let activeBranches = 0;
    let newBranches7d = 0;
    let newBranches30d = 0;
    const expiring: ExpiringAccount[] = [];

    for (const b of branchRows) {
      if (b.isActive) activeBranches += 1;
      const format = b.serviceFormat || 'UNSET';
      formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1);
      const ageDays = (now.getTime() - b.createdAt.getTime()) / DAY_MS;
      if (ageDays <= 7) newBranches7d += 1;
      if (ageDays <= 30) newBranches30d += 1;

      const current =
        pickCurrentSubscription(subsByBranch.get(b.id) ?? []) ??
        (b.retailTenantId != null
          ? pickCurrentSubscription(legacyByTenant.get(b.retailTenantId) ?? [])
          : null);
      const state = billingStateOf(current, now);
      branchBilling[state] += 1;
      if (!current) continue;

      if (state === 'PAYING' && !countedSubIds.has(current.id)) {
        countedSubIds.add(current.id);
        branchMrr += summarizeSubscription(current, now).monthlyAmount;
      }
      const summary = summarizeSubscription(current, now);
      if (isExpiringSoon(state, summary)) {
        expiring.push({
          kind: 'BRANCH',
          id: b.id,
          name: b.name,
          ownerEmail: b.owner?.email ?? null,
          tenantName: b.retailTenant?.name ?? null,
          serviceFormat: b.serviceFormat ?? null,
          subscription: summary,
        });
      }
    }

    const subsBySupplier = groupBy(supplierSubs, (s) => s.supplierProfileId);
    const supplierBilling = emptyBillingCounts();
    const onboarding: Record<string, number> = {};
    const activation: Record<string, number> = {};
    let supplierMrr = 0;
    let newSuppliers30d = 0;

    for (const s of supplierRows) {
      onboarding[s.onboardingStatus] =
        (onboarding[s.onboardingStatus] ?? 0) + 1;
      activation[s.activationStatus] =
        (activation[s.activationStatus] ?? 0) + 1;
      if ((now.getTime() - s.createdAt.getTime()) / DAY_MS <= 30) {
        newSuppliers30d += 1;
      }
      const current = pickCurrentSubscription(subsBySupplier.get(s.id) ?? []);
      const state = billingStateOf(current, now);
      supplierBilling[state] += 1;
      if (!current) continue;
      const summary = summarizeSubscription(current, now);
      if (state === 'PAYING') supplierMrr += summary.monthlyAmount;
      if (isExpiringSoon(state, summary)) {
        expiring.push({
          kind: 'SUPPLIER',
          id: s.id,
          name: s.companyName,
          ownerEmail: s.user?.email ?? null,
          tenantName: null,
          serviceFormat: null,
          subscription: summary,
        });
      }
    }

    expiring.sort(
      (a, b) =>
        (a.subscription.daysRemaining ?? 0) -
        (b.subscription.daysRemaining ?? 0),
    );

    const partnerStatus: Record<string, number> = {};
    for (const p of partners) {
      partnerStatus[p.status] = (partnerStatus[p.status] ?? 0) + 1;
    }

    let bnplOutstandingAmount = 0;
    let bnplOverdueCount = 0;
    let bnplOverdueAmount = 0;
    for (const a of bnpl) {
      const owed = Number(a.settlementAmountDue) || 0;
      bnplOutstandingAmount += owed;
      if (a.dueAt.getTime() < now.getTime()) {
        bnplOverdueCount += 1;
        bnplOverdueAmount += owed;
      }
    }

    return {
      generatedAt: now.toISOString(),
      currency: 'ETB',
      branches: {
        total: branchRows.length,
        active: activeBranches,
        inactive: branchRows.length - activeBranches,
        newLast7Days: newBranches7d,
        newLast30Days: newBranches30d,
        byServiceFormat: [...formatCounts.entries()]
          .map(([serviceFormat, count]) => ({ serviceFormat, count }))
          .sort((a, b) => b.count - a.count),
        billing: branchBilling,
      },
      tenants: { total: tenantCount },
      suppliers: {
        total: supplierRows.length,
        pendingReview: onboarding.PENDING_REVIEW ?? 0,
        newLast30Days: newSuppliers30d,
        byOnboardingStatus: onboarding,
        byActivationStatus: activation,
        billing: supplierBilling,
      },
      revenue: {
        branchMrr: round2(branchMrr),
        supplierMrr: round2(supplierMrr),
        totalMrr: round2(branchMrr + supplierMrr),
      },
      equity: {
        partnersByStatus: partnerStatus,
        bnplOutstandingCount: bnpl.length,
        bnplOutstandingAmount: round2(bnplOutstandingAmount),
        bnplOverdueCount,
        bnplOverdueAmount: round2(bnplOverdueAmount),
      },
      expiringSoon: expiring.slice(0, EXPIRING_LIST_LIMIT),
      expiringSoonTotal: expiring.length,
      expiringWindowDays: EXPIRING_WINDOW_DAYS,
    };
  }
}

function isExpiringSoon(state: BillingState, summary: SubscriptionSummary) {
  return (
    (state === 'PAYING' || state === 'TRIAL') &&
    summary.daysRemaining !== null &&
    summary.daysRemaining <= EXPIRING_WINDOW_DAYS
  );
}

function emptyBillingCounts(): Record<BillingState, number> {
  return { PAYING: 0, TRIAL: 0, LAPSED: 0, NONE: 0 };
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
