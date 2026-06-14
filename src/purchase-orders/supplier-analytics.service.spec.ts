import { SupplierAnalyticsService } from './supplier-analytics.service';

function makeService(pos: any[]): SupplierAnalyticsService {
  const repo = { find: jest.fn().mockResolvedValue(pos) };
  return new SupplierAnalyticsService(repo as any);
}

const NOW = new Date('2026-07-01T00:00:00Z').getTime();

function po(overrides: any = {}) {
  return {
    supplierProfileId: 55,
    supplierProfile: { companyName: 'Rift Valley' },
    status: 'SUBMITTED',
    total: 0,
    items: [],
    ...overrides,
  };
}

describe('SupplierAnalyticsService', () => {
  it('returns empty totals/suppliers when there are no purchase orders', async () => {
    const result = await makeService([]).getSupplierAnalytics({}, NOW);
    expect(result.suppliers).toEqual([]);
    expect(result.totals).toEqual({
      totalSpend: 0,
      openPayables: 0,
      orderCount: 0,
      supplierCount: 0,
    });
  });

  it('counts committed spend (excludes DRAFT/CANCELLED) and open payables', async () => {
    const result = await makeService([
      po({ status: 'SUBMITTED', total: 100 }),
      po({ status: 'SHIPPED', total: 200, shippedAt: '2026-06-20T00:00:00Z' }),
      po({ status: 'DRAFT', total: 999 }),
      po({ status: 'CANCELLED', total: 50 }),
    ]).getSupplierAnalytics({}, NOW);

    expect(result.suppliers).toHaveLength(1);
    const s = result.suppliers[0];
    expect(s.supplierName).toBe('Rift Valley');
    expect(s.orderCount).toBe(2); // SUBMITTED + SHIPPED
    expect(s.totalSpend).toBe(300);
    expect(s.openPayables).toBe(200); // only SHIPPED
    expect(s.aging.d0_30).toBe(200); // shipped 11 days ago
    expect(result.totals).toEqual({
      totalSpend: 300,
      openPayables: 200,
      orderCount: 2,
      supplierCount: 1,
    });
  });

  it('buckets open payables by age from shippedAt', async () => {
    const result = await makeService([
      po({ status: 'SHIPPED', total: 10, shippedAt: '2026-06-25T00:00:00Z' }), // 6d
      po({ status: 'SHIPPED', total: 20, shippedAt: '2026-05-15T00:00:00Z' }), // 47d
      po({ status: 'SHIPPED', total: 40, shippedAt: '2026-04-25T00:00:00Z' }), // 67d
      po({ status: 'SHIPPED', total: 80, shippedAt: '2026-01-01T00:00:00Z' }), // >90d
    ]).getSupplierAnalytics({}, NOW);

    expect(result.suppliers[0].aging).toEqual({
      d0_30: 10,
      d31_60: 20,
      d61_90: 40,
      d90_plus: 80,
    });
  });

  it('computes delivery performance for completed orders', async () => {
    const result = await makeService([
      po({
        status: 'RECEIVED',
        total: 100,
        expectedDeliveryDate: '2026-06-10',
        submittedAt: '2026-06-01T00:00:00Z',
        receivedAt: '2026-06-09T00:00:00Z',
        items: [
          {
            receivedQuantity: 10,
            damagedQuantity: 1,
            supplierOffer: { leadTimeDays: 5 },
          },
        ],
      }),
    ]).getSupplierAnalytics({}, NOW);

    const perf = result.suppliers[0].performance;
    expect(perf.completedOrders).toBe(1);
    expect(perf.onTimeRate).toBe(1); // received 06-09 <= expected 06-10
    expect(perf.damageRate).toBe(0.1); // 1 / 10
    expect(perf.avgActualLeadTimeDays).toBe(8); // 06-01 -> 06-09
    expect(perf.avgQuotedLeadTimeDays).toBe(5);
  });

  it('flags a late delivery and yields null rates when data is missing', async () => {
    const result = await makeService([
      // Late, with damage 0/− handled; quoted lead time absent.
      po({
        status: 'RECEIVED',
        total: 100,
        expectedDeliveryDate: '2026-06-10',
        receivedAt: '2026-06-15T00:00:00Z',
        items: [
          { receivedQuantity: 0, damagedQuantity: 0, supplierOffer: null },
        ],
      }),
      // Completed but no expected date and no received qty -> excluded from those rates.
      po({ status: 'RECONCILED', total: 50, items: [] }),
    ]).getSupplierAnalytics({}, NOW);

    const perf = result.suppliers[0].performance;
    expect(perf.completedOrders).toBe(2);
    expect(perf.onTimeRate).toBe(0); // 1 eligible, 0 on time
    expect(perf.damageRate).toBeNull(); // received qty sum is 0 -> no divide-by-zero
    expect(perf.avgQuotedLeadTimeDays).toBeNull();
  });
});
