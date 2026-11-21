import { BadRequestException, ConflictException } from '@nestjs/common';
import { SubscriptionPaymentClaimsService } from './subscription-payment-claims.service';
import { SUBSCRIPTION_PAYMENT_DESTINATIONS } from './payment-destinations';

function createService(overrides: { reused?: any; open?: any } = {}) {
  const queryBuilder: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(overrides.reused ?? null),
  };
  const repo = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    findOne: jest.fn().mockResolvedValue(overrides.open ?? null),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 7, ...value })),
  };
  return { service: new SubscriptionPaymentClaimsService(repo as any), repo };
}

describe('subscription payment destinations', () => {
  it('bills to exactly the two agreed accounts', () => {
    expect(
      SUBSCRIPTION_PAYMENT_DESTINATIONS.map((entry) => [
        entry.channel,
        entry.account,
        entry.accountName,
      ]),
    ).toEqual([
      ['EBIRR', '0915333513', 'Suuq S App'],
      ['CBE', '1000285447578', 'Ugas Fuad Ugasafi'],
    ]);
  });
});

describe('SubscriptionPaymentClaimsService', () => {
  const target = { kind: 'POS_BRANCH' as const, branchId: 21 };

  it('refuses a channel that is not one of the two accounts', async () => {
    const { service } = createService();
    await expect(
      service.assertProofAcceptable(
        { channel: 'TELEBIRR', payerReference: 'FT24123ABCD' },
        target,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a transaction number that already paid for something', async () => {
    const { service } = createService({ reused: { id: 3 } });
    await expect(
      service.assertProofAcceptable(
        { channel: 'CBE', payerReference: 'FT24123ABCD' },
        target,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a second claim while one for the same branch is being checked', async () => {
    const { service } = createService({ open: { id: 4, status: 'SUBMITTED' } });
    await expect(
      service.assertProofAcceptable(
        { channel: 'EBIRR', payerReference: 'TX998877' },
        target,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('never matches somebody else’s open claim when the target has no id yet', async () => {
    const { service, repo } = createService({ open: { id: 4 } });
    await expect(
      service.assertProofAcceptable(
        { channel: 'EBIRR', payerReference: 'TX998877' },
        { kind: 'BNPL' },
      ),
    ).resolves.toBeUndefined();
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('files a claim as SUBMITTED — it grants nothing by itself', async () => {
    const { service } = createService();
    const claim = await service.submit({
      referenceId: 'POSACT-21-1-MONTHLY',
      kind: 'POS_BRANCH',
      userId: 9,
      branchId: 21,
      amount: 3900,
      channel: 'cbe',
      payerReference: '  FT24123ABCD  ',
      receiptUrl: 'https://cdn.example/receipt.jpg',
    });
    expect(claim).toMatchObject({
      status: 'SUBMITTED',
      channel: 'CBE',
      payerReference: 'FT24123ABCD',
      receiptUrl: 'https://cdn.example/receipt.jpg',
    });
    expect(service.describeForCustomer(claim as any).status).toBe(
      'PENDING_VERIFICATION',
    );
  });
});
