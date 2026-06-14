import { PosRegisterReportService } from './pos-register-report.service';
import {
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from './entities/pos-checkout.entity';

// Focused coverage for the server-side aggregation that powers the end-of-shift
// report emailed to the branch owner on session close. The math (gross/returns/
// net, payment mix netting, expected-cash + variance) must be authoritative, so
// it is verified independently of the email/PDF plumbing.

describe('PosRegisterReportService.buildReport', () => {
  function makeService(checkouts: any[]) {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(checkouts),
    };
    const checkoutsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const branchesRepository = { findOne: jest.fn() };
    const emailService = { send: jest.fn() };
    const service = new PosRegisterReportService(
      checkoutsRepository as any,
      branchesRepository as any,
      emailService as any,
    );
    return { service, qb };
  }

  const session: any = {
    id: 7,
    branchId: 3,
    registerId: 'web-01',
    openingFloat: 500,
    closingFloat: 8620,
    openedAt: new Date('2026-06-14T11:00:00Z'),
    closedAt: new Date('2026-06-14T19:00:00Z'),
  };

  function sale(total: number, tenders: any[], itemCount = 1) {
    return {
      transactionType: PosCheckoutTransactionType.SALE,
      status: PosCheckoutStatus.RECEIVED,
      currency: 'ETB',
      total,
      tipAmount: 0,
      itemCount,
      tenders,
    };
  }

  function ret(total: number, tenders: any[]) {
    return {
      transactionType: PosCheckoutTransactionType.RETURN,
      status: PosCheckoutStatus.PROCESSED,
      currency: 'ETB',
      total,
      tipAmount: 0,
      itemCount: 1,
      tenders,
    };
  }

  it('aggregates gross/returns/net, payment mix and cash variance', async () => {
    const { service } = makeService([
      sale(8100, [{ method: 'CASH', amount: 8100 }], 3),
      sale(3200, [{ method: 'CARD', amount: 3200 }], 2),
      sale(850, [{ method: 'MOBILE_MONEY', amount: 850 }], 1),
      ret(300, [{ method: 'CASH', amount: 300 }]),
    ]);

    const r = await service.buildReport(session);

    expect(r.grossSales).toBe(12150); // 8100 + 3200 + 850
    expect(r.returnsTotal).toBe(300);
    expect(r.netSales).toBe(11850);
    expect(r.receiptCount).toBe(3);
    expect(r.returnCount).toBe(1);
    expect(r.itemCount).toBe(6);
    expect(r.currency).toBe('ETB');

    // cash net = 8100 sale - 300 refund = 7800; expected = opening 500 + 7800
    expect(r.cashNet).toBe(7800);
    expect(r.expectedCash).toBe(8300);
    // closing float 8620 - expected 8300 = +320 over
    expect(r.variance).toBe(320);

    // payment mix is net per method, sorted desc by amount
    expect(r.paymentMix.map((m) => [m.method, m.amount])).toEqual([
      ['CASH', 7800],
      ['CARD', 3200],
      ['MOBILE_MONEY', 850],
    ]);
    expect(r.paymentMix[2].label).toBe('Mobile money');
  });

  it('handles an empty session with no checkouts', async () => {
    const { service } = makeService([]);
    const r = await service.buildReport(session);

    expect(r.grossSales).toBe(0);
    expect(r.netSales).toBe(0);
    expect(r.receiptCount).toBe(0);
    expect(r.averageTicket).toBe(0);
    expect(r.paymentMix).toEqual([]);
    // no cash movement → expected equals opening float; variance vs closing
    expect(r.expectedCash).toBe(500);
    expect(r.variance).toBe(8120);
  });

  it('leaves expected cash / variance null when floats are absent', async () => {
    const { service } = makeService([
      sale(100, [{ method: 'CASH', amount: 100 }]),
    ]);
    const noFloat = { ...session, openingFloat: null, closingFloat: null };
    const r = await service.buildReport(noFloat);

    expect(r.expectedCash).toBeNull();
    expect(r.variance).toBeNull();
  });
});
