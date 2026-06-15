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

// End-to-end of the close-report dispatch: a client "Today"-tab report renders
// to HTML + a PDF attachment that must decode to a valid PDF (the attachment
// previously double-base64-encoded and would not open).
describe('PosRegisterReportService.dispatchCloseReport (client report)', () => {
  function makeService() {
    const checkoutsRepository = {
      createQueryBuilder: jest.fn(),
      // resolveCurrency()
      findOne: jest.fn().mockResolvedValue({ currency: 'ETB' }),
    };
    const branchesRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 3,
        name: 'Bole Branch',
        owner: { email: 'owner@x.com' },
      }),
    };
    const sent: any[] = [];
    const emailService = {
      send: jest.fn(async (mail: any) => sent.push(mail)),
    };
    const service = new PosRegisterReportService(
      checkoutsRepository as any,
      branchesRepository as any,
      emailService as any,
    );
    return { service, emailService, sent };
  }

  const session: any = {
    id: 42,
    branchId: 3,
    branchSessionNumber: 12,
    registerId: 'front-desk',
    openingFloat: 500,
    closingFloat: 9100,
    openedByName: 'amir@x.com',
    closedByName: 'amir@x.com',
    openedAt: new Date('2026-06-14T08:00:00Z'),
    closedAt: new Date('2026-06-14T20:00:00Z'),
    note: null,
  };

  const clientReport = {
    summary: {
      grossSales: 12450,
      returnsTotal: 300,
      netSales: 12150,
      receiptCount: 37,
      averageTicket: 336.49,
      readyTicketCount: 5,
    },
    paymentMix: [
      { method: 'CASH', label: 'Cash', amount: 8100 },
      { method: 'CARD', label: 'Card', amount: 4350 },
    ],
    waiters: [
      {
        name: 'Sara',
        salesTotal: 7000,
        itemCount: 40,
        receiptCount: 20,
        tableCount: 6,
      },
    ],
    cooks: [
      {
        name: 'Mulu',
        ticketCount: 18,
        itemCount: 52,
        stations: [{ label: 'Grill', ticketCount: 18 }],
      },
    ],
    settledRooms: [
      {
        room: '101',
        settled: 5000,
        receiptCount: 2,
        guestName: 'Jon',
        settledBy: 'amir@x.com',
      },
    ],
    settlers: [
      { name: 'amir@x.com', settled: 12450, receiptCount: 37, roomCount: 8 },
    ],
    settledReceipts: [
      {
        label: 'R-001',
        total: 500,
        operatorName: 'amir@x.com',
        paymentMethods: ['CASH'],
        itemCount: 3,
      },
    ],
    counts: {
      waiters: 1,
      cooks: 1,
      settledRooms: 1,
      settlers: 1,
      settledReceipts: 1,
    },
    hasSales: true,
    hasKitchenActivity: true,
  };

  it('emails the owner an HTML report whose PDF attachment decodes to a real PDF', async () => {
    const { service, emailService, sent } = makeService();

    await service.dispatchCloseReport(session, {
      report: clientReport,
      serviceFormat: 'HOTEL',
    });

    expect(emailService.send).toHaveBeenCalledTimes(1);
    const mail = sent[0];
    expect(mail.to).toBe('owner@x.com');
    // HTML mirrors the Today tab sections
    expect(mail.html).toContain('Sara'); // waiter
    expect(mail.html).toContain('Mulu'); // cook
    expect(mail.html).toContain('Settled rooms'); // HOTEL unit label
    expect(mail.html).toContain('Ready tickets (KDS)');
    // Cash variance: opening 500 + cash 8100 = 8600 expected; closing 9100 → +500
    expect(mail.html).toContain('Variance');

    // The attachment must be base64 that decodes to a valid PDF (not double-encoded)
    const att = mail.attachments[0];
    expect(att.encoding).toBe('base64');
    expect(att.contentType).toBe('application/pdf');
    const decoded = Buffer.from(att.content, 'base64');
    expect(decoded.slice(0, 5).toString()).toBe('%PDF-');
    expect(decoded.slice(-6).toString()).toContain('EOF');
  });

  it('skips silently when the branch has no owner email', async () => {
    const { service, emailService } = makeService();
    (service as any).branchesRepository.findOne = jest
      .fn()
      .mockResolvedValue({ id: 3, name: 'Bole', owner: null });

    await service.dispatchCloseReport(session, { report: clientReport });
    expect(emailService.send).not.toHaveBeenCalled();
  });
});
