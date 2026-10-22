import { AdminPosOverviewService } from './admin-pos-overview.service';
import { EquityPartnerBnplStatus } from './entities/equity-partner-bnpl-activation.entity';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';

const NOW = new Date('2026-10-20T12:00:00Z');
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 86400000);

function qbReturning(rows: unknown[]) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['leftJoin', 'select']) qb[m] = jest.fn(() => qb);
  qb.getMany = jest.fn().mockResolvedValue(rows);
  return qb;
}

function subscription(overrides: Record<string, unknown>) {
  return {
    planCode: 'POS_BRANCH_SUBSCRIPTION',
    status: TenantSubscriptionStatus.ACTIVE,
    billingInterval: TenantBillingInterval.MONTHLY,
    amount: 3900,
    currency: 'ETB',
    startsAt: daysFromNow(-20),
    endsAt: daysFromNow(10),
    ...overrides,
  };
}

function build({
  branches = [] as unknown[],
  tenantSubs = [] as unknown[],
  suppliers = [] as unknown[],
  supplierSubs = [] as unknown[],
  partners = [] as unknown[],
  bnpl = [] as unknown[],
}) {
  const repo = (extra: Record<string, unknown>) => extra as any;
  return new AdminPosOverviewService(
    repo({ createQueryBuilder: () => qbReturning(branches) }),
    repo({ count: jest.fn().mockResolvedValue(3) }),
    repo({ find: jest.fn().mockResolvedValue(tenantSubs) }),
    repo({ createQueryBuilder: () => qbReturning(suppliers) }),
    repo({ find: jest.fn().mockResolvedValue(supplierSubs) }),
    repo({ find: jest.fn().mockResolvedValue(partners) }),
    repo({ find: jest.fn().mockResolvedValue(bnpl) }),
  );
}

describe('AdminPosOverviewService', () => {
  it('classifies branches by billing state and sums paying MRR', async () => {
    const service = build({
      branches: [
        {
          id: 1,
          name: 'Paying',
          isActive: true,
          serviceFormat: 'RETAIL',
          retailTenantId: 10,
          createdAt: daysFromNow(-3),
          owner: { email: 'a@x.et' },
          retailTenant: { name: 'A' },
        },
        {
          id: 2,
          name: 'Trial',
          isActive: true,
          serviceFormat: 'QSR',
          retailTenantId: 11,
          createdAt: daysFromNow(-40),
        },
        {
          id: 3,
          name: 'Lapsed',
          isActive: false,
          serviceFormat: 'RETAIL',
          retailTenantId: 12,
          createdAt: daysFromNow(-90),
        },
        {
          id: 4,
          name: 'Never',
          isActive: true,
          serviceFormat: null,
          retailTenantId: null,
          createdAt: daysFromNow(-1),
        },
      ],
      tenantSubs: [
        subscription({ id: 100, tenantId: 10, branchId: 1 }),
        subscription({
          id: 101,
          tenantId: 11,
          branchId: 2,
          status: TenantSubscriptionStatus.TRIAL,
          amount: 0,
          endsAt: daysFromNow(60),
        }),
        subscription({
          id: 102,
          tenantId: 12,
          branchId: 3,
          endsAt: daysFromNow(-5),
        }),
      ],
    });

    const out = await service.getOverview(NOW);

    expect(out.branches.total).toBe(4);
    expect(out.branches.active).toBe(3);
    expect(out.branches.newLast7Days).toBe(2);
    expect(out.branches.billing).toEqual({
      PAYING: 1,
      TRIAL: 1,
      LAPSED: 1,
      NONE: 1,
    });
    expect(out.branches.byServiceFormat[0]).toEqual({
      serviceFormat: 'RETAIL',
      count: 2,
    });
    expect(out.revenue.branchMrr).toBe(3900);
    expect(out.expiringSoon).toHaveLength(1);
    expect(out.expiringSoon[0]).toMatchObject({
      kind: 'BRANCH',
      id: 1,
      ownerEmail: 'a@x.et',
      tenantName: 'A',
    });
  });

  it('counts a legacy tenant-wide subscription once across its branches', async () => {
    const service = build({
      branches: [
        {
          id: 1,
          name: 'One',
          isActive: true,
          serviceFormat: 'RETAIL',
          retailTenantId: 10,
          createdAt: daysFromNow(-100),
        },
        {
          id: 2,
          name: 'Two',
          isActive: true,
          serviceFormat: 'RETAIL',
          retailTenantId: 10,
          createdAt: daysFromNow(-100),
        },
      ],
      tenantSubs: [
        subscription({ id: 200, tenantId: 10, branchId: null, endsAt: null }),
      ],
    });

    const out = await service.getOverview(NOW);

    expect(out.branches.billing.PAYING).toBe(2);
    expect(out.revenue.branchMrr).toBe(3900);
  });

  it('summarises suppliers, partners and outstanding BNPL', async () => {
    const service = build({
      suppliers: [
        {
          id: 5,
          companyName: 'Wholesale',
          onboardingStatus: 'PENDING_REVIEW',
          activationStatus: 'ACTIVE',
          isActive: true,
          createdAt: daysFromNow(-2),
          user: { email: 's@x.et' },
        },
        {
          id: 6,
          companyName: 'Draft Co',
          onboardingStatus: 'DRAFT',
          activationStatus: 'PENDING_PAYMENT',
          isActive: true,
          createdAt: daysFromNow(-200),
        },
      ],
      supplierSubs: [
        subscription({
          id: 300,
          supplierProfileId: 5,
          billingInterval: TenantBillingInterval.ONE_YEAR,
          amountTotal: 34800,
          periodMonths: 12,
          endsAt: daysFromNow(3),
        }),
      ],
      partners: [
        { status: 'ACTIVE' },
        { status: 'ACTIVE' },
        { status: 'PENDING' },
      ],
      bnpl: [
        {
          status: EquityPartnerBnplStatus.OUTSTANDING,
          settlementAmountDue: 1000,
          dueAt: daysFromNow(-1),
        },
        {
          status: EquityPartnerBnplStatus.OUTSTANDING,
          settlementAmountDue: 500,
          dueAt: daysFromNow(30),
        },
      ],
    });

    const out = await service.getOverview(NOW);

    expect(out.suppliers.pendingReview).toBe(1);
    expect(out.suppliers.newLast30Days).toBe(1);
    expect(out.suppliers.billing).toEqual({
      PAYING: 1,
      TRIAL: 0,
      LAPSED: 0,
      NONE: 1,
    });
    expect(out.revenue.supplierMrr).toBe(2900);
    expect(out.revenue.totalMrr).toBe(2900);
    expect(out.expiringSoon[0]).toMatchObject({ kind: 'SUPPLIER', id: 5 });
    expect(out.equity.partnersByStatus).toEqual({ ACTIVE: 2, PENDING: 1 });
    expect(out.equity).toMatchObject({
      bnplOutstandingCount: 2,
      bnplOutstandingAmount: 1500,
      bnplOverdueCount: 1,
      bnplOverdueAmount: 1000,
    });
  });
});
