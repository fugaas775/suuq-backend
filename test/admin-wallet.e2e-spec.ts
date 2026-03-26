import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import request from 'supertest';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { AdminWalletController } from '../src/admin/admin-wallet.controller';
import { OrdersService } from '../src/orders/orders.service';
import { WalletService } from '../src/wallet/wallet.service';

describe('AdminWalletController query contract (e2e)', () => {
  let app: INestApplication;
  let walletService: {
    findAllTopUpRequests: jest.Mock;
    getAllPayouts: jest.Mock;
    exportPendingPayouts: jest.Mock;
    getFailedAutoEbirrPayouts: jest.Mock;
    getReconcileRequiredPayoutExceptions: jest.Mock;
    exportFailedAutoEbirrPayouts: jest.Mock;
    getPayoutById: jest.Mock;
    reconcilePayoutDebitException: jest.Mock;
    updatePayoutStatus: jest.Mock;
    deletePayout: jest.Mock;
    deletePayouts: jest.Mock;
    getWalletStats: jest.Mock;
    findAllTransactions: jest.Mock;
    getWallet: jest.Mock;
    recalculateBalance: jest.Mock;
    syncWalletCurrency: jest.Mock;
    bulkDeleteTransactions: jest.Mock;
    deleteTransaction: jest.Mock;
  };

  beforeAll(async () => {
    walletService = {
      findAllTopUpRequests: jest.fn().mockResolvedValue({
        data: [{ id: 11, status: 'APPROVED' }],
        total: 1,
        page: 2,
        pages: 1,
      }),
      getAllPayouts: jest.fn().mockResolvedValue({
        data: [{ id: 21, status: 'FAILED' }],
        total: 1,
      }),
      exportPendingPayouts: jest.fn().mockResolvedValue('id,status\n1,PENDING'),
      getFailedAutoEbirrPayouts: jest.fn().mockResolvedValue({
        data: [{ id: 31, status: 'FAILED' }],
        total: 1,
      }),
      getReconcileRequiredPayoutExceptions: jest.fn().mockResolvedValue({
        data: [{ id: 41, status: 'SUCCESS' }],
        total: 1,
      }),
      exportFailedAutoEbirrPayouts: jest
        .fn()
        .mockResolvedValue('id,status\n31,FAILED'),
      getPayoutById: jest.fn(),
      reconcilePayoutDebitException: jest.fn(),
      updatePayoutStatus: jest.fn(),
      deletePayout: jest.fn(),
      deletePayouts: jest.fn(),
      getWalletStats: jest.fn().mockResolvedValue({
        totalTransactions: 0,
        activeSubscriptions: 0,
        certifiedVendors: 0,
        revenue: 0,
      }),
      findAllTransactions: jest.fn().mockResolvedValue({
        data: [{ id: 51, type: 'PAYMENT', orderId: 17, userId: 29 }],
        total: 1,
        page: 2,
        pages: 1,
      }),
      getWallet: jest.fn(),
      recalculateBalance: jest.fn(),
      syncWalletCurrency: jest.fn(),
      bulkDeleteTransactions: jest.fn(),
      deleteTransaction: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminWalletController],
      providers: [
        { provide: WalletService, useValue: walletService },
        {
          provide: OrdersService,
          useValue: { retryFailedAutoPayout: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists wallet admin resources with validated filters', async () => {
    const topUps = await request(app.getHttpServer())
      .get('/api/admin/wallet/top-ups')
      .query({ page: '2', limit: '25', status: 'approved' })
      .expect(200);

    expect(topUps.body).toEqual(expect.objectContaining({ page: 2, total: 1 }));
    expect(walletService.findAllTopUpRequests).toHaveBeenCalledWith(
      2,
      25,
      'APPROVED',
    );

    const payouts = await request(app.getHttpServer())
      .get('/api/admin/wallet/payouts')
      .query({ page: '3', limit: '10', status: 'failed' })
      .expect(200);

    expect(payouts.body).toEqual(expect.objectContaining({ total: 1 }));
    expect(walletService.getAllPayouts).toHaveBeenCalledWith(3, 10, 'FAILED');

    await request(app.getHttpServer())
      .get('/api/admin/wallet/payouts/auto-failures')
      .query({ page: '4', limit: '9' })
      .expect(200);

    expect(walletService.getFailedAutoEbirrPayouts).toHaveBeenCalledWith(4, 9);

    await request(app.getHttpServer())
      .get('/api/admin/wallet/payouts/exceptions')
      .query({ page: '5', limit: '8' })
      .expect(200);

    expect(
      walletService.getReconcileRequiredPayoutExceptions,
    ).toHaveBeenCalledWith(5, 8);
  });

  it('lists wallet transactions with validated filters and mapped legacy aliases', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/wallet/transactions')
      .query({
        page: '2',
        limit: '30',
        type: 'PURCHASE',
        orderId: '17',
        userId: '29',
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-20T00:00:00.000Z',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({ page: 2, total: 1 }),
    );
    expect(walletService.findAllTransactions).toHaveBeenCalledWith(
      2,
      30,
      'PAYMENT',
      17,
      29,
      '2026-03-01T00:00:00.000Z',
      '2026-03-20T00:00:00.000Z',
    );
  });

  it('exports failed auto payouts with validated date filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/wallet/payouts/auto-failures/export')
      .query({
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-20T00:00:00.000Z',
      })
      .expect(200);

    expect(walletService.exportFailedAutoEbirrPayouts).toHaveBeenCalledWith(
      '2026-03-01T00:00:00.000Z',
      '2026-03-20T00:00:00.000Z',
    );
  });

  it('rejects malformed wallet query filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/wallet/top-ups?page=abc')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/wallet/payouts?status=bogus')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/wallet/payouts/auto-failures?limit=0')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/wallet/transactions?type=bogus')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/wallet/transactions?orderId=abc')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/wallet/transactions?startDate=not-a-date')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/wallet/payouts/auto-failures/export?from=not-a-date')
      .expect(400);
  });
});
