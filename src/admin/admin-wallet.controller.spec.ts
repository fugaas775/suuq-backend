import { Test, TestingModule } from '@nestjs/testing';
import { AdminWalletController } from './admin-wallet.controller';
import { OrdersService } from '../orders/orders.service';
import { WalletService } from '../wallet/wallet.service';

describe('AdminWalletController', () => {
  let controller: AdminWalletController;
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

  beforeEach(async () => {
    walletService = {
      findAllTopUpRequests: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, pages: 0 }),
      getAllPayouts: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      exportPendingPayouts: jest.fn().mockResolvedValue('csv'),
      getFailedAutoEbirrPayouts: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0 }),
      getReconcileRequiredPayoutExceptions: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0 }),
      exportFailedAutoEbirrPayouts: jest.fn().mockResolvedValue('csv'),
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
      findAllTransactions: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, pages: 0 }),
      getWallet: jest.fn(),
      recalculateBalance: jest.fn(),
      syncWalletCurrency: jest.fn(),
      bulkDeleteTransactions: jest.fn(),
      deleteTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminWalletController],
      providers: [
        { provide: WalletService, useValue: walletService },
        {
          provide: OrdersService,
          useValue: { retryFailedAutoPayout: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(AdminWalletController);
  });

  it('forwards validated top-up query filters', async () => {
    await controller.listTopUpRequests({
      page: 2,
      limit: 25,
      status: 'APPROVED' as any,
    });

    expect(walletService.findAllTopUpRequests).toHaveBeenCalledWith(
      2,
      25,
      'APPROVED',
    );
  });

  it('forwards validated payout query filters', async () => {
    await controller.listPayouts({
      page: 3,
      limit: 15,
      status: 'FAILED' as any,
    });

    expect(walletService.getAllPayouts).toHaveBeenCalledWith(3, 15, 'FAILED');
  });

  it('forwards validated auto payout filters and export dates', async () => {
    await controller.listAutoPayoutFailures({ page: 4, limit: 10 });
    await controller.listPayoutExceptions({ page: 5, limit: 12 });
    await controller.exportAutoPayoutFailures({
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-20T00:00:00.000Z',
    });

    expect(walletService.getFailedAutoEbirrPayouts).toHaveBeenCalledWith(4, 10);
    expect(
      walletService.getReconcileRequiredPayoutExceptions,
    ).toHaveBeenCalledWith(5, 12);
    expect(walletService.exportFailedAutoEbirrPayouts).toHaveBeenCalledWith(
      '2026-03-01T00:00:00.000Z',
      '2026-03-20T00:00:00.000Z',
    );
  });

  it('forwards validated transaction filters and mapped legacy type aliases', async () => {
    await controller.listTransactions({
      page: 2,
      limit: 30,
      type: 'PAYMENT' as any,
      orderId: 17,
      userId: 29,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-20T00:00:00.000Z',
    });

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
});
