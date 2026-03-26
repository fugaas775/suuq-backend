import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminEbirrAuditController } from './ebirr-audit.controller';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { EbirrService } from '../ebirr/ebirr.service';

describe('AdminEbirrAuditController', () => {
  let controller: AdminEbirrAuditController;
  let queryBuilder: {
    orderBy: jest.Mock;
    take: jest.Mock;
    skip: jest.Mock;
    where: jest.Mock;
    getManyAndCount: jest.Mock;
  };
  let ebirrRepo: { createQueryBuilder: jest.Mock; delete: jest.Mock };
  let ebirrService: {
    reconcileStuckInitiatedTransactions: jest.Mock;
  };

  beforeEach(async () => {
    queryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 8 }], 1]),
    };

    ebirrRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      delete: jest.fn(),
    };

    ebirrService = {
      reconcileStuckInitiatedTransactions: jest.fn().mockResolvedValue({
        scanned: 1,
        completed: 0,
        expired: 1,
        dryRun: true,
        items: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminEbirrAuditController],
      providers: [
        { provide: getRepositoryToken(EbirrTransaction), useValue: ebirrRepo },
        { provide: EbirrService, useValue: ebirrService },
      ],
    }).compile();

    controller = module.get(AdminEbirrAuditController);
  });

  it('uses validated transaction filters and trims search text', async () => {
    const result = await controller.getTransactions({
      page: 2,
      limit: 75,
      search: 'BOOST-17',
    });

    expect(queryBuilder.take).toHaveBeenCalledWith(75);
    expect(queryBuilder.skip).toHaveBeenCalledWith(75);
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'et.merch_order_id LIKE :search OR et.req_transaction_id LIKE :search OR et.invoiceId LIKE :search OR et.payer_account LIKE :search',
      { search: '%BOOST-17%' },
    );
    expect(result).toEqual({
      data: [{ id: 8 }],
      total: 1,
      page: 2,
      last_page: 1,
    });
  });

  it('defaults transaction pagination and omits search when absent', async () => {
    await controller.getTransactions({});

    expect(queryBuilder.take).toHaveBeenCalledWith(50);
    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(queryBuilder.where).not.toHaveBeenCalled();
  });

  it('forwards validated initiated report filters as dry-run reconciliation', async () => {
    await controller.reconcileInitiatedReport({
      olderThanMinutes: 45,
      limit: 150,
    });

    expect(
      ebirrService.reconcileStuckInitiatedTransactions,
    ).toHaveBeenCalledWith({
      olderThanMinutes: 45,
      limit: 150,
      dryRun: true,
    });
  });
});
