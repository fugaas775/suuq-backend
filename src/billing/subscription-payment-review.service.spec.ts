import { BadRequestException, ConflictException } from '@nestjs/common';
import { SubscriptionPaymentReviewService } from './subscription-payment-review.service';

function createService(claim: any, extra: { claims?: any[] } = {}) {
  const claims = {
    findByIdOrFail: jest.fn().mockResolvedValue(claim),
    markReviewed: jest.fn(async (row, outcome, reviewer, note) =>
      Object.assign(row, {
        status: outcome,
        reviewedByUserId: reviewer.id,
        reviewedAt: new Date('2026-11-21T09:00:00.000Z'),
        reviewNote: note ?? null,
      }),
    ),
    listAll: jest.fn().mockResolvedValue(extra.claims ?? []),
    listForAdmin: jest.fn().mockResolvedValue([]),
  };
  const posActivation = {
    completeActivationPayment: jest.fn().mockResolvedValue({ id: 1 }),
    completeBranchCreationPayment: jest
      .fn()
      .mockResolvedValue({ branchId: 88, created: true }),
  };
  const supplierActivation = {
    completeActivationPayment: jest.fn().mockResolvedValue({ id: 2 }),
  };
  const bnpl = { completeSettlement: jest.fn().mockResolvedValue({ id: 3 }) };
  const notifications = { createAndDispatch: jest.fn() };
  const emptyQuery: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const service = new SubscriptionPaymentReviewService(
    claims as any,
    posActivation as any,
    supplierActivation as any,
    bnpl as any,
    notifications as any,
    { createQueryBuilder: jest.fn(() => emptyQuery) } as any,
    { find: jest.fn().mockResolvedValue([]) } as any,
    { find: jest.fn().mockResolvedValue([]) } as any,
    { find: jest.fn().mockResolvedValue([]) } as any,
  );
  return {
    service,
    claims,
    posActivation,
    supplierActivation,
    bnpl,
    notifications,
  };
}

const submitted = (overrides: Record<string, any> = {}) => ({
  id: 5,
  referenceId: 'POSACT-21-1790000000000-ONE_YEAR',
  kind: 'POS_BRANCH',
  status: 'SUBMITTED',
  userId: 9,
  branchId: 21,
  period: 'ONE_YEAR',
  amount: 42120,
  currency: 'ETB',
  channel: 'CBE',
  payerReference: 'FT24123ABCD',
  subjectName: 'Bole Flagship',
  createdAt: new Date('2026-11-20T09:00:00.000Z'),
  ...overrides,
});

describe('SubscriptionPaymentReviewService', () => {
  it('grants the term on approval, then marks the claim and tells the customer', async () => {
    const { service, posActivation, claims, notifications } =
      createService(submitted());

    const result = await service.approve(5, { id: 1 });

    expect(posActivation.completeActivationPayment).toHaveBeenCalledWith(
      'POSACT-21-1790000000000-ONE_YEAR',
      'ONE_YEAR',
    );
    expect(result.status).toBe('APPROVED');
    expect(claims.markReviewed).toHaveBeenCalledTimes(1);
    expect(notifications.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 9, title: 'Payment verified' }),
    );
  });

  it('leaves the claim in the queue when granting fails', async () => {
    const { service, posActivation, claims } = createService(submitted());
    posActivation.completeActivationPayment.mockRejectedValue(
      new Error('tenant not ready'),
    );

    await expect(service.approve(5, { id: 1 })).rejects.toThrow(
      'tenant not ready',
    );
    expect(claims.markReviewed).not.toHaveBeenCalled();
  });

  it('grants once however many times approve is pressed', async () => {
    const { service, posActivation } = createService(
      submitted({ status: 'APPROVED' }),
    );
    await service.approve(5, { id: 1 });
    expect(posActivation.completeActivationPayment).not.toHaveBeenCalled();
  });

  it('routes each kind of payment to what it pays for', async () => {
    const branch = createService(
      submitted({ kind: 'POS_BRANCH_CREATE', branchId: null }),
    );
    expect((await branch.service.approve(5, { id: 1 })).branchId).toBe(88);

    const supplier = createService(submitted({ kind: 'SUPPLIER' }));
    await supplier.service.approve(5, { id: 1 });
    expect(
      supplier.supplierActivation.completeActivationPayment,
    ).toHaveBeenCalled();

    const bnpl = createService(submitted({ kind: 'BNPL' }));
    await bnpl.service.approve(5, { id: 1 });
    expect(bnpl.bnpl.completeSettlement).toHaveBeenCalled();
  });

  it('needs a reason to reject, grants nothing, and shows the customer why', async () => {
    const { service, posActivation, notifications } =
      createService(submitted());

    await expect(service.reject(5, { id: 1 }, '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const rejected = await service.reject(
      5,
      { id: 1 },
      'No transfer with this number on the CBE statement.',
    );

    expect(rejected.status).toBe('REJECTED');
    expect(posActivation.completeActivationPayment).not.toHaveBeenCalled();
    expect(notifications.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('No transfer with this number'),
      }),
    );
  });

  it('will not reject a payment whose term was already granted', async () => {
    const { service } = createService(submitted({ status: 'APPROVED' }));
    await expect(
      service.reject(5, { id: 1 }, 'changed my mind'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reports money actually collected, by where it landed, and what is waiting', async () => {
    const now = new Date('2026-11-21T09:00:00.000Z');
    const { service } = createService(null, {
      claims: [
        submitted({
          status: 'APPROVED',
          reviewedAt: new Date('2026-11-20T10:00:00.000Z'),
        }),
        submitted({
          id: 6,
          status: 'APPROVED',
          channel: 'EBIRR',
          amount: 3900,
          reviewedAt: new Date('2026-10-05T10:00:00.000Z'),
        }),
        submitted({ id: 7, amount: 3900 }),
      ],
    });

    const report = await service.report(now);

    expect(report.collected.thisMonth).toBe(42120);
    expect(report.collected.lastMonth).toBe(3900);
    expect(report.collected.byMonth.at(-1)).toMatchObject({
      month: '2026-11',
      CBE: 42120,
      EBIRR: 0,
    });
    expect(report.waiting).toMatchObject({ count: 1, amount: 3900 });
  });
});
