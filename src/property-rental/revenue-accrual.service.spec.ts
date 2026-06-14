import {
  RevenueAccrualService,
  computeAccrualRecognition,
} from './revenue-accrual.service';

const baseBooking = {
  leaseStartAt: '2026-01-01',
  billingCycle: 'MONTH' as const,
  periodsBilled: 3,
  chargesTotal: 3000,
  paidAmount: 3000,
  recognizedAmount: 0,
};

describe('computeAccrualRecognition', () => {
  it('recognizes one period of earned, collected rent', () => {
    const r = computeAccrualRecognition(
      baseBooking,
      new Date('2026-02-01T00:00:00Z'),
    );
    expect(r.earnedToDate).toBe(1000);
    expect(r.recognizable).toBe(1000);
    expect(r.recognizeNow).toBe(1000);
  });

  it('recognizes only the increment beyond what is already recognized', () => {
    const r = computeAccrualRecognition(
      { ...baseBooking, recognizedAmount: 1000 },
      new Date('2026-03-01T00:00:00Z'), // 2 periods elapsed
    );
    expect(r.earnedToDate).toBe(2000);
    expect(r.recognizeNow).toBe(1000);
  });

  it('never recognizes more than has been collected (deferred)', () => {
    const r = computeAccrualRecognition(
      { ...baseBooking, paidAmount: 500 },
      new Date('2026-02-01T00:00:00Z'), // 1 period earned = 1000
    );
    expect(r.earnedToDate).toBe(1000);
    expect(r.recognizable).toBe(500); // capped at collected
    expect(r.recognizeNow).toBe(500);
  });

  it('caps earned at the total rent for an over-elapsed lease', () => {
    const r = computeAccrualRecognition(
      baseBooking,
      new Date('2026-09-01T00:00:00Z'), // far past lease end
    );
    expect(r.earnedToDate).toBe(3000);
    expect(r.recognizeNow).toBe(3000);
  });

  it('recognizes nothing without a lease start or billed periods', () => {
    expect(
      computeAccrualRecognition(
        { ...baseBooking, leaseStartAt: null },
        new Date('2026-02-01T00:00:00Z'),
      ).recognizeNow,
    ).toBe(0);
    expect(
      computeAccrualRecognition(
        { ...baseBooking, periodsBilled: 0 },
        new Date('2026-02-01T00:00:00Z'),
      ).recognizeNow,
    ).toBe(0);
  });
});

describe('RevenueAccrualService.recognizeBooking', () => {
  it('posts Dr Deferred revenue / Cr Rental revenue and bumps recognizedAmount', async () => {
    const generalLedger = { post: jest.fn().mockResolvedValue({ id: 1 }) };
    const bookingRepo = { save: jest.fn(async (b: any) => b) };
    const service = new RevenueAccrualService(
      bookingRepo as never,
      generalLedger as never,
    );
    const booking: any = {
      id: 77,
      branchId: 4,
      currency: 'ETB',
      ...baseBooking,
    };

    const recognized = await service.recognizeBooking(
      booking,
      new Date('2026-02-01T00:00:00Z'),
    );

    expect(recognized).toBe(1000);
    const entry = generalLedger.post.mock.calls[0][0];
    expect(entry.sourceType).toBe('REVENUE_ACCRUAL');
    expect(entry.lines.find((l: any) => l.accountCode === '2400').debit).toBe(
      1000,
    ); // DEFERRED_REVENUE
    expect(entry.lines.find((l: any) => l.accountCode === '4100').credit).toBe(
      1000,
    ); // RENTAL_REVENUE
    expect(booking.recognizedAmount).toBe(1000);
    expect(bookingRepo.save).toHaveBeenCalled();
  });

  it('is a no-op when nothing new is earned', async () => {
    const generalLedger = { post: jest.fn() };
    const bookingRepo = { save: jest.fn() };
    const service = new RevenueAccrualService(
      bookingRepo as never,
      generalLedger as never,
    );
    const booking: any = {
      id: 77,
      branchId: 4,
      currency: 'ETB',
      ...baseBooking,
      recognizedAmount: 1000,
    };

    const recognized = await service.recognizeBooking(
      booking,
      new Date('2026-02-01T00:00:00Z'), // still only 1 period earned = 1000, already recognized
    );
    expect(recognized).toBe(0);
    expect(generalLedger.post).not.toHaveBeenCalled();
  });
});
