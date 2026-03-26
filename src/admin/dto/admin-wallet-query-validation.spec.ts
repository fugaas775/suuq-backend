import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminWalletAutoPayoutExportQueryDto } from './admin-wallet-auto-payout-export-query.dto';
import { AdminWalletPageQueryDto } from './admin-wallet-page-query.dto';
import { AdminWalletPayoutQueryDto } from './admin-wallet-payout-query.dto';
import { AdminWalletTopUpQueryDto } from './admin-wallet-top-up-query.dto';
import { AdminWalletTransactionsQueryDto } from './admin-wallet-transactions-query.dto';

describe('Admin wallet DTO validation', () => {
  it('transforms valid top-up filters', () => {
    const dto = plainToInstance(AdminWalletTopUpQueryDto, {
      page: '2',
      limit: '25',
      status: 'approved',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        page: 2,
        limit: 25,
        status: 'APPROVED',
      }),
    );
  });

  it('transforms valid payout filters', () => {
    const dto = plainToInstance(AdminWalletPayoutQueryDto, {
      page: '3',
      limit: '10',
      status: 'failed',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        page: 3,
        limit: 10,
        status: 'FAILED',
      }),
    );
  });

  it('transforms valid transaction filters and legacy aliases', () => {
    const dto = plainToInstance(AdminWalletTransactionsQueryDto, {
      page: '2',
      limit: '50',
      type: 'PURCHASE',
      orderId: '17',
      userId: '29',
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-20T00:00:00.000Z',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        page: 2,
        limit: 50,
        type: 'PAYMENT',
        orderId: 17,
        userId: 29,
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-20T00:00:00.000Z',
      }),
    );
  });

  it('transforms valid export date filters', () => {
    const dto = plainToInstance(AdminWalletAutoPayoutExportQueryDto, {
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-20T00:00:00.000Z',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-20T00:00:00.000Z',
      }),
    );
  });

  it('rejects malformed wallet query filters', () => {
    const pageDto = plainToInstance(AdminWalletPageQueryDto, {
      page: 'abc',
      limit: '0',
    });
    const topUpDto = plainToInstance(AdminWalletTopUpQueryDto, {
      status: 'nope',
    });
    const payoutDto = plainToInstance(AdminWalletPayoutQueryDto, {
      status: 'not-real',
    });
    const txDto = plainToInstance(AdminWalletTransactionsQueryDto, {
      type: 'bogus',
      orderId: 'x',
      userId: '0',
      startDate: 'not-a-date',
    });
    const exportDto = plainToInstance(AdminWalletAutoPayoutExportQueryDto, {
      from: 'bad-date',
    });

    expect(validateSync(pageDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'limit']),
    );
    expect(validateSync(topUpDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['status']),
    );
    expect(validateSync(payoutDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['status']),
    );
    expect(validateSync(txDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['type', 'orderId', 'userId', 'startDate']),
    );
    expect(validateSync(exportDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['from']),
    );
  });
});
