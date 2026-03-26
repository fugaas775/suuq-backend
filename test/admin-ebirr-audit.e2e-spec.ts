import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AdminEbirrAuditController } from '../src/admin/ebirr-audit.controller';
import { EbirrTransaction } from '../src/payments/entities/ebirr-transaction.entity';
import { EbirrService } from '../src/ebirr/ebirr.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';

describe('AdminEbirrAuditController query contract (e2e)', () => {
  let app: INestApplication;
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

  beforeAll(async () => {
    queryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getManyAndCount: jest
        .fn()
        .mockResolvedValue([
          [{ id: 22, merch_order_id: 'BOOST-22', status: 'INITIATED' }],
          1,
        ]),
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
        items: [
          {
            txId: 22,
            referenceId: 'BOOST-22',
            invoiceId: 'INV-22',
            previousStatus: 'INITIATED',
            nextStatus: 'EXPIRED',
            reason: 'Admin reconciliation: payment not confirmed in time',
            orderId: 22,
          },
        ],
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminEbirrAuditController],
      providers: [
        { provide: getRepositoryToken(EbirrTransaction), useValue: ebirrRepo },
        { provide: EbirrService, useValue: ebirrService },
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

  it('lists Ebirr transactions with validated filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/ebirr/transactions')
      .query({ page: '2', limit: '75', search: '  BOOST-22  ' })
      .expect(200);

    expect(queryBuilder.take).toHaveBeenCalledWith(75);
    expect(queryBuilder.skip).toHaveBeenCalledWith(75);
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'et.merch_order_id LIKE :search OR et.req_transaction_id LIKE :search OR et.invoiceId LIKE :search OR et.payer_account LIKE :search',
      { search: '%BOOST-22%' },
    );
    expect(response.body).toEqual({
      data: [{ id: 22, merch_order_id: 'BOOST-22', status: 'INITIATED' }],
      total: 1,
      page: 2,
      last_page: 1,
    });
  });

  it('runs initiated reconciliation reports with validated dry-run filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/ebirr/reconcile/initiated/report')
      .query({ olderThanMinutes: '45', limit: '150' })
      .expect(200);

    expect(
      ebirrService.reconcileStuckInitiatedTransactions,
    ).toHaveBeenCalledWith({
      olderThanMinutes: 45,
      limit: 150,
      dryRun: true,
    });
    expect(response.body).toEqual(
      expect.objectContaining({ scanned: 1, dryRun: true }),
    );
  });

  it('rejects malformed Ebirr admin query filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/ebirr/transactions?page=abc')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/ebirr/transactions?limit=0')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/ebirr/reconcile/initiated/report?olderThanMinutes=0')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/ebirr/reconcile/initiated/report?limit=999')
      .expect(400);
  });
});
