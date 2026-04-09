import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { PurchaseOrdersController } from '../src/purchase-orders/purchase-orders.controller';
import { PurchaseOrdersService } from '../src/purchase-orders/purchase-orders.service';

describe('PurchaseOrdersController receipt-event contract (e2e)', () => {
  let app: INestApplication;
  let purchaseOrdersService: {
    listReceiptEvents: jest.Mock;
    recordReceiptEvent: jest.Mock;
    acknowledgeReceiptEvent: jest.Mock;
    resolveReceiptEventDiscrepancy: jest.Mock;
    approveReceiptEventDiscrepancy: jest.Mock;
  };

  beforeAll(async () => {
    purchaseOrdersService = {
      listReceiptEvents: jest
        .fn()
        .mockResolvedValue([
          { id: 81, purchaseOrderId: 42, status: 'RECEIVED' },
        ]),
      recordReceiptEvent: jest.fn().mockResolvedValue({
        id: 81,
        purchaseOrderId: 42,
        status: 'RECEIVED',
      }),
      acknowledgeReceiptEvent: jest.fn().mockResolvedValue({
        id: 81,
        purchaseOrderId: 42,
        acknowledged: true,
      }),
      resolveReceiptEventDiscrepancy: jest.fn().mockResolvedValue({
        id: 81,
        purchaseOrderId: 42,
        discrepancyStatus: 'RESOLVED',
      }),
      approveReceiptEventDiscrepancy: jest.fn().mockResolvedValue({
        id: 81,
        purchaseOrderId: 42,
        discrepancyStatus: 'APPROVED',
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PurchaseOrdersController],
      providers: [
        {
          provide: PurchaseOrdersService,
          useValue: purchaseOrdersService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            id: 7,
            email: 'buyer@test.com',
            roles: ['ADMIN', 'B2B_BUYER'],
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists purchase-order receipt events', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/hub/v1/purchase-orders/42/receipt-events')
      .query({ branchId: 7 })
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({ id: 81, purchaseOrderId: 42 }),
    ]);
    expect(purchaseOrdersService.listReceiptEvents).toHaveBeenCalledWith(42, {
      branchId: 7,
    });
  });

  it('records receipt events with actor metadata', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/hub/v1/purchase-orders/42/receipt-events')
      .query({ branchId: 7 })
      .send({
        reason: 'Second truck delivered remaining cartons.',
        metadata: { dockDoor: 'B2' },
        receiptLines: [
          {
            itemId: 101,
            receivedQuantity: 3,
            shortageQuantity: 1,
            damagedQuantity: 0,
            note: 'One unit missing',
          },
        ],
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({ id: 81, purchaseOrderId: 42 }),
    );
    expect(purchaseOrdersService.recordReceiptEvent).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        reason: 'Second truck delivered remaining cartons.',
      }),
      {
        id: 7,
        branchId: 7,
        email: 'buyer@test.com',
        roles: ['ADMIN', 'B2B_BUYER'],
      },
    );
  });

  it('acknowledges receipt events with actor metadata', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/hub/v1/purchase-orders/42/receipt-events/81/acknowledge')
      .query({ branchId: 7 })
      .send({ note: 'Supplier reviewed the branch receipt.' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({ id: 81, purchaseOrderId: 42 }),
    );
    expect(purchaseOrdersService.acknowledgeReceiptEvent).toHaveBeenCalledWith(
      42,
      81,
      { note: 'Supplier reviewed the branch receipt.' },
      {
        id: 7,
        branchId: 7,
        email: 'buyer@test.com',
        roles: ['ADMIN', 'B2B_BUYER'],
      },
    );
  });

  it('records discrepancy resolutions with actor metadata', async () => {
    const response = await request(app.getHttpServer())
      .patch(
        '/api/hub/v1/purchase-orders/42/receipt-events/81/discrepancy-resolution',
      )
      .query({ branchId: 7 })
      .send({
        resolutionNote:
          'Supplier will issue a credit note and replace the damaged carton tomorrow.',
        metadata: { creditMemoNumber: 'CM-101' },
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({ id: 81, purchaseOrderId: 42 }),
    );
    expect(
      purchaseOrdersService.resolveReceiptEventDiscrepancy,
    ).toHaveBeenCalledWith(
      42,
      81,
      expect.objectContaining({
        resolutionNote:
          'Supplier will issue a credit note and replace the damaged carton tomorrow.',
      }),
      {
        id: 7,
        branchId: 7,
        email: 'buyer@test.com',
        roles: ['ADMIN', 'B2B_BUYER'],
      },
    );
  });

  it('approves discrepancy resolutions with actor metadata', async () => {
    const response = await request(app.getHttpServer())
      .patch(
        '/api/hub/v1/purchase-orders/42/receipt-events/81/discrepancy-approval',
      )
      .query({ branchId: 7 })
      .send({ note: 'Approved after reviewing supplier credit memo.' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({ id: 81, purchaseOrderId: 42 }),
    );
    expect(
      purchaseOrdersService.approveReceiptEventDiscrepancy,
    ).toHaveBeenCalledWith(
      42,
      81,
      { note: 'Approved after reviewing supplier credit memo.' },
      {
        id: 7,
        branchId: 7,
        email: 'buyer@test.com',
        roles: ['ADMIN', 'B2B_BUYER'],
      },
    );
  });

  it('rejects malformed receipt-event payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/hub/v1/purchase-orders/42/receipt-events')
      .send({ metadata: 'not-an-object' })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/api/hub/v1/purchase-orders/42/receipt-events/81/acknowledge')
      .send({ note: 'x'.repeat(501) })
      .expect(400);

    await request(app.getHttpServer())
      .patch(
        '/api/hub/v1/purchase-orders/42/receipt-events/81/discrepancy-resolution',
      )
      .send({ resolutionNote: 'x'.repeat(1001) })
      .expect(400);

    await request(app.getHttpServer())
      .patch(
        '/api/hub/v1/purchase-orders/42/receipt-events/81/discrepancy-approval',
      )
      .send({ note: 'x'.repeat(1001) })
      .expect(400);
  });
});
