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
    // No drawer movements: the branch has never filed a purchase run, which is
    // every branch until somebody does. The expected-cash math must be the same
    // as it was before pos_cash_movements existed.
    const cashMovementsRepository = { find: jest.fn().mockResolvedValue([]) };
    const service = new PosRegisterReportService(
      checkoutsRepository as any,
      branchesRepository as any,
      cashMovementsRepository as any,
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

  it('does not count change handed back as money taken', async () => {
    // SMAK's fee desk, 2026-08-19: a 6,000 tender against a 2,000 bill.
    const { service } = makeService([
      {
        ...sale(2000, [{ method: 'MOBILE_MONEY', amount: 6000 }]),
        changeDue: 4000,
      },
      { ...sale(380, [{ method: 'CASH', amount: 500 }]), changeDue: 120 },
    ]);
    const r = await service.buildReport(session);

    expect(r.grossSales).toBe(2380);
    expect(r.paymentMix.map((m) => [m.method, m.amount])).toEqual([
      ['MOBILE_MONEY', 2000],
      ['CASH', 380],
    ]);
    // opening 500 + the 380 the drawer kept, not the 500 held out
    expect(r.expectedCash).toBe(880);
  });

  it('takes a refund with no tender rows off the method it was paid out on', async () => {
    const { service } = makeService([
      sale(1000, [{ method: 'CASH', amount: 1000 }]),
      {
        ...ret(400, []),
        metadata: { returnContext: { refundMethod: 'cash' } },
      },
    ]);
    const r = await service.buildReport(session);

    expect(r.cashNet).toBe(600);
    expect(r.expectedCash).toBe(1100);
    expect(r.paymentMix.map((m) => [m.method, m.amount])).toEqual([
      ['CASH', 600],
    ]);
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
  // `checkouts` is what the books hold for the session. Empty by default: the
  // till's sales have not synced yet, so the till's report is the fuller one.
  function makeService(checkouts: any[] = []) {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(checkouts),
    };
    const checkoutsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
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
    // No drawer movements: the branch has never filed a purchase run, which is
    // every branch until somebody does. The expected-cash math must be the same
    // as it was before pos_cash_movements existed.
    const cashMovementsRepository = { find: jest.fn().mockResolvedValue([]) };
    const service = new PosRegisterReportService(
      checkoutsRepository as any,
      branchesRepository as any,
      cashMovementsRepository as any,
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

  // A fee payment as the books hold it: the class rides `roomNumber`, the
  // pupil `guestName`, and the person who took it `cashierName`.
  function feePayment(
    id: number,
    total: number,
    pupil: string,
    tenders: any[],
    extra: Record<string, any> = {},
  ) {
    return {
      id,
      transactionType: PosCheckoutTransactionType.SALE,
      status: PosCheckoutStatus.PROCESSED,
      currency: 'ETB',
      total,
      tipAmount: 0,
      changeDue: 0,
      itemCount: 1,
      receiptNumber: `R-${id}`,
      cashierName: 'Sagal Hassan',
      occurredAt: new Date(`2026-10-05T04:${10 + id}:00Z`),
      metadata: { roomNumber: '7A', guestName: pupil, folioId: 900 + id },
      tenders,
      ...extra,
    };
  }

  const emptyTillReport = {
    summary: {
      grossSales: 0,
      returnsTotal: 0,
      netSales: 0,
      receiptCount: 0,
      averageTicket: 0,
      readyTicketCount: 0,
    },
    paymentMix: [],
    waiters: [],
    cooks: [],
    settledRooms: [],
    settlers: [],
    settledReceipts: [],
    counts: {},
    hasSales: false,
    hasKitchenActivity: false,
  };

  it('draws the report from the books when the closing till holds none of the receipts', async () => {
    // SMAQ School session #51: opened by the cashier, closed by the bursar from
    // her own sign-in, whose till held none of the morning's fee receipts.
    const { service, sent } = makeService([
      feePayment(1, 2000, 'Ahmed Ali', [{ method: 'CASH', amount: 2000 }]),
      feePayment(2, 1500, 'Hodan Yusuf', [
        { method: 'MOBILE_MONEY', amount: 1500 },
      ]),
      feePayment(3, 500, 'Ahmed Ali', [{ method: 'CASH', amount: 500 }]),
    ]);

    await service.dispatchCloseReport(
      { ...session, openingFloat: null, closingFloat: null },
      { report: emptyTillReport, serviceFormat: 'SCHOOL' },
    );

    const mail = sent[0];
    expect(mail.subject).toContain('Net 4,000.00 ETB');
    expect(mail.html).toContain('4,000.00 ETB'); // gross + net
    expect(mail.html).not.toContain('No payments recorded');
    expect(mail.html).toContain('Mobile money');
    expect(mail.html).toContain('2,500.00 ETB'); // cash: 2,000 + 500
    // Who paid, by pupil — two payments by one child are one row.
    expect(mail.html).toContain('Settled student fees');
    expect(mail.html).toContain('7A · Ahmed Ali');
    expect(mail.html).toContain('7A · Hodan Yusuf');
    expect(mail.html).toContain('Sagal Hassan');
    expect(mail.html).toContain('R-3');
    expect(mail.text).toContain('Receipts      : 3');
  });

  it('keeps the kitchen figures of a till whose receipts were short', async () => {
    const { service, sent } = makeService([
      feePayment(1, 300, 'Table 4', [{ method: 'CASH', amount: 300 }]),
    ]);

    await service.dispatchCloseReport(session, {
      report: {
        ...emptyTillReport,
        summary: { ...emptyTillReport.summary, readyTicketCount: 5 },
        cooks: clientReport.cooks,
      },
      serviceFormat: 'QSR',
    });

    expect(sent[0].html).toContain('Mulu');
    expect(sent[0].html).toContain('Ready tickets (KDS)');
    expect(sent[0].html).toContain('300.00 ETB');
  });

  it("keeps the till's report when it holds at least what the books do", async () => {
    // One of the till's 37 sales has reached the books; the rest are still on
    // their way. The till knows more, and its report is the one that is sent.
    const { service, sent } = makeService([
      feePayment(1, 500, 'Jon', [{ method: 'CASH', amount: 500 }]),
    ]);

    await service.dispatchCloseReport(session, {
      report: clientReport,
      serviceFormat: 'HOTEL',
    });

    expect(sent[0].subject).toContain('Net 12,150.00 ETB');
    expect(sent[0].html).toContain('Sara');
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
