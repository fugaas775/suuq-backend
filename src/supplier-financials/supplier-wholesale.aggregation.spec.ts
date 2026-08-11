import { summarizeWholesale } from './supplier-wholesale.aggregation';

const NOW = new Date('2026-07-01T00:00:00Z').getTime();
// A window covering June 2026 (EAT-aware bounds, as the frontend would send).
const JUNE = {
  from: '2026-05-31T21:00:00.000Z', // 2026-06-01 00:00 EAT
  to: '2026-06-30T20:59:59.999Z', // 2026-06-30 23:59 EAT
};

function po(overrides: any = {}) {
  return {
    id: 1,
    supplierProfileId: 55,
    branchId: 10,
    branch: { id: 10, name: 'Buyer A' },
    status: 'SUBMITTED',
    currency: 'ETB',
    total: 0,
    items: [],
    ...overrides,
  };
}

describe('summarizeWholesale', () => {
  it('returns an empty, well-formed summary for no orders', () => {
    const s = summarizeWholesale([], JUNE, NOW);
    expect(s.recognizedRevenue).toBe(0);
    expect(s.backlogValue).toBe(0);
    expect(s.receivablesOutstanding).toBe(0);
    expect(s.currency).toBe('ETB');
    expect(s.dailyTotals).toEqual([]);
    expect(s.topOffers).toEqual([]);
    expect(s.buyerBreakdown).toEqual([]);
    expect(s.fulfillment.onTimeRate).toBeNull();
  });

  it('recognises revenue only for delivered orders within the window', () => {
    const s = summarizeWholesale(
      [
        po({
          id: 1,
          status: 'RECEIVED',
          total: 500,
          receivedAt: '2026-06-15T08:00:00Z',
        }),
        po({
          id: 2,
          status: 'RECONCILED',
          total: 300,
          receivedAt: '2026-06-20T08:00:00Z',
        }),
        // Delivered OUTSIDE the window — excluded from recognised revenue.
        po({
          id: 3,
          status: 'RECEIVED',
          total: 999,
          receivedAt: '2026-05-01T08:00:00Z',
        }),
        // Not yet delivered — backlog, not revenue.
        po({
          id: 4,
          status: 'SHIPPED',
          total: 200,
          shippedAt: '2026-06-28T08:00:00Z',
        }),
      ],
      JUNE,
      NOW,
    );
    expect(s.recognizedRevenue).toBe(800);
    expect(s.recognizedCount).toBe(2);
  });

  it('snapshots backlog + receivables regardless of window', () => {
    const s = summarizeWholesale(
      [
        po({ id: 1, status: 'SUBMITTED', total: 100 }),
        po({ id: 2, status: 'ACKNOWLEDGED', total: 150 }),
        po({
          id: 3,
          status: 'SHIPPED',
          total: 200,
          shippedAt: '2026-06-20T00:00:00Z',
        }),
        po({
          id: 4,
          status: 'RECEIVED',
          total: 400,
          receivedAt: '2026-06-25T00:00:00Z',
        }),
      ],
      JUNE,
      NOW,
    );
    // Backlog = SUBMITTED + ACKNOWLEDGED + SHIPPED.
    expect(s.backlogValue).toBe(450);
    expect(s.backlogCount).toBe(3);
    // Receivables = SHIPPED + RECEIVED.
    expect(s.receivablesOutstanding).toBe(600);
    expect(s.receivablesCount).toBe(2);
  });

  it('excludes DRAFT and CANCELLED from money totals but records them in the funnel', () => {
    const s = summarizeWholesale(
      [
        po({ id: 1, status: 'DRAFT', total: 999 }),
        po({ id: 2, status: 'CANCELLED', total: 50 }),
        po({
          id: 3,
          status: 'RECEIVED',
          total: 100,
          receivedAt: '2026-06-10T00:00:00Z',
        }),
      ],
      JUNE,
      NOW,
    );
    expect(s.recognizedRevenue).toBe(100);
    expect(s.backlogValue).toBe(0);
    expect(s.receivablesOutstanding).toBe(100); // the RECEIVED order
    const draft = s.statusFunnel.find((f) => f.status === 'DRAFT');
    const cancelled = s.statusFunnel.find((f) => f.status === 'CANCELLED');
    expect(draft?.count).toBe(1);
    expect(cancelled?.count).toBe(1);
  });

  it('buckets receivables aging from shippedAt', () => {
    const s = summarizeWholesale(
      [
        po({
          id: 1,
          status: 'SHIPPED',
          total: 10,
          shippedAt: '2026-06-25T00:00:00Z',
        }), // 6d
        po({
          id: 2,
          status: 'SHIPPED',
          total: 20,
          shippedAt: '2026-05-15T00:00:00Z',
        }), // 47d
        po({
          id: 3,
          status: 'SHIPPED',
          total: 40,
          shippedAt: '2026-04-25T00:00:00Z',
        }), // 67d
        po({
          id: 4,
          status: 'SHIPPED',
          total: 80,
          shippedAt: '2026-01-01T00:00:00Z',
        }), // >90d
      ],
      JUNE,
      NOW,
    );
    expect(s.receivablesAging.d0_30).toBe(10);
    expect(s.receivablesAging.d31_60).toBe(20);
    expect(s.receivablesAging.d61_90).toBe(40);
    expect(s.receivablesAging.d90_plus).toBe(80);
  });

  it('rolls top offers and buyer breakdown from recognised orders', () => {
    const s = summarizeWholesale(
      [
        po({
          id: 1,
          branchId: 10,
          branch: { id: 10, name: 'Buyer A' },
          status: 'RECEIVED',
          total: 500,
          receivedAt: '2026-06-15T08:00:00Z',
          items: [
            {
              productId: 1,
              product: { name: 'Rice 25kg', sku: 'RICE25' },
              receivedQuantity: 10,
              unitPrice: 40,
            },
            {
              productId: 2,
              product: { name: 'Oil 5L', sku: 'OIL5' },
              receivedQuantity: 5,
              unitPrice: 20,
            },
          ],
        }),
        po({
          id: 2,
          branchId: 20,
          branch: { id: 20, name: 'Buyer B' },
          status: 'RECEIVED',
          total: 200,
          receivedAt: '2026-06-18T08:00:00Z',
          items: [
            {
              productId: 1,
              product: { name: 'Rice 25kg', sku: 'RICE25' },
              receivedQuantity: 5,
              unitPrice: 40,
            },
          ],
        }),
      ],
      JUNE,
      NOW,
    );
    expect(s.topOffers[0]).toMatchObject({
      name: 'Rice 25kg',
      sku: 'RICE25',
      quantity: 15,
      revenue: 600,
    });
    expect(s.buyerBreakdown).toHaveLength(2);
    expect(s.buyerBreakdown[0]).toMatchObject({
      buyerName: 'Buyer A',
      recognizedRevenue: 500,
    });
  });

  it('computes fulfillment KPIs (on-time, damage, lead time)', () => {
    const s = summarizeWholesale(
      [
        po({
          id: 1,
          status: 'RECEIVED',
          total: 100,
          submittedAt: '2026-06-01T00:00:00Z',
          expectedDeliveryDate: '2026-06-10',
          receivedAt: '2026-06-09T00:00:00Z', // on time
          items: [
            {
              productId: 1,
              receivedQuantity: 10,
              damagedQuantity: 1,
              supplierOffer: { leadTimeDays: 7 },
            },
          ],
        }),
        po({
          id: 2,
          status: 'RECEIVED',
          total: 100,
          submittedAt: '2026-06-01T00:00:00Z',
          expectedDeliveryDate: '2026-06-10',
          receivedAt: '2026-06-15T00:00:00Z', // late
          items: [
            {
              productId: 1,
              receivedQuantity: 10,
              damagedQuantity: 0,
              supplierOffer: { leadTimeDays: 9 },
            },
          ],
        }),
      ],
      JUNE,
      NOW,
    );
    expect(s.fulfillment.completedOrders).toBe(2);
    expect(s.fulfillment.onTimeRate).toBe(0.5);
    expect(s.fulfillment.damageRate).toBe(0.05); // 1 damaged / 20 received
    expect(s.fulfillment.avgQuotedLeadTimeDays).toBe(8);
    expect(s.fulfillment.avgActualLeadTimeDays).toBe(11); // 8 and 14 days
  });

  it('buckets recognised revenue into EAT daily totals', () => {
    const s = summarizeWholesale(
      [
        // 2026-06-30 23:30 EAT = 2026-06-30 20:30 UTC → EAT day 2026-06-30.
        po({
          id: 1,
          status: 'RECEIVED',
          total: 100,
          receivedAt: '2026-06-30T20:30:00Z',
        }),
        // 2026-06-30 22:30 UTC = 2026-07-01 01:30 EAT → EAT day 2026-07-01 (outside window upper bound? to=20:59:59Z, so excluded).
        po({
          id: 2,
          status: 'RECEIVED',
          total: 50,
          receivedAt: '2026-06-15T05:00:00Z',
        }),
      ],
      JUNE,
      NOW,
    );
    const keys = s.dailyTotals.map((d) => d.dayKey);
    expect(keys).toContain('2026-06-30');
    expect(keys).toContain('2026-06-15');
  });
});
