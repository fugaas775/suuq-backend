import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { closeE2eApp } from './utils/e2e-cleanup';

const mockBuyerGuard = {
  canActivate: (ctx: any) => {
    const req = ctx.switchToHttp().getRequest();
    req.user = {
      email: 'buyer@test.com',
      roles: ['SUPER_ADMIN', 'POS_MANAGER'],
    };
    return true;
  },
};

describe('B2B Receipt Events (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userId: number;
  let productId: number;
  let branchId: number;
  let supplierProfileId: number;
  let purchaseOrderId: number;
  let purchaseOrderItemId: number;
  const orderNumber = `PO-E2E-${Date.now()}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue(mockBuyerGuard)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockBuyerGuard)
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    dataSource = app.get(DataSource);

    const userRow = await dataSource.query(
      'SELECT id FROM "user" ORDER BY id ASC LIMIT 1',
    );
    const productRow = await dataSource.query(
      'SELECT id FROM "product" ORDER BY id ASC LIMIT 1',
    );

    if (!userRow[0]?.id || !productRow[0]?.id) {
      throw new Error(
        'E2E receipt-events test requires at least one user and one product in the database',
      );
    }

    userId = Number(userRow[0].id);
    productId = Number(productRow[0].id);

    const insertedBranch = await dataSource.query(
      `INSERT INTO "branches" ("name", "ownerId", "isActive") VALUES ($1, $2, true) RETURNING "id"`,
      [`E2E Branch ${orderNumber}`, userId],
    );
    branchId = Number(insertedBranch[0].id);

    const insertedSupplier = await dataSource.query(
      `INSERT INTO "supplier_profiles" ("userId", "companyName", "countriesServed", "onboardingStatus", "isActive") VALUES ($1, $2, $3, $4, true) RETURNING "id"`,
      [userId, `E2E Supplier ${orderNumber}`, ['Ethiopia'], 'APPROVED'],
    );
    supplierProfileId = Number(insertedSupplier[0].id);

    const insertedOrder = await dataSource.query(
      `INSERT INTO "purchase_orders" ("orderNumber", "branchId", "supplierProfileId", "status", "currency", "subtotal", "total") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING "id"`,
      [orderNumber, branchId, supplierProfileId, 'SHIPPED', 'USD', 100, 100],
    );
    purchaseOrderId = Number(insertedOrder[0].id);

    const insertedItem = await dataSource.query(
      `INSERT INTO "purchase_order_items" ("purchaseOrderId", "productId", "orderedQuantity", "receivedQuantity", "shortageQuantity", "damagedQuantity", "unitPrice") VALUES ($1, $2, $3, 0, 0, 0, $4) RETURNING "id"`,
      [purchaseOrderId, productId, 5, 20],
    );
    purchaseOrderItemId = Number(insertedItem[0].id);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(
        `DELETE FROM "stock_movements" WHERE "sourceType" = 'PURCHASE_ORDER' AND "sourceReferenceId" = $1`,
        [purchaseOrderId],
      );
      await dataSource.query(
        `DELETE FROM "branch_inventory" WHERE "lastPurchaseOrderId" = $1`,
        [purchaseOrderId],
      );
      await dataSource.query(
        `DELETE FROM "purchase_order_receipt_events" WHERE "purchaseOrderId" = $1`,
        [purchaseOrderId],
      );
      await dataSource.query(
        `DELETE FROM "purchase_order_items" WHERE "purchaseOrderId" = $1`,
        [purchaseOrderId],
      );
      await dataSource.query(`DELETE FROM "purchase_orders" WHERE "id" = $1`, [
        purchaseOrderId,
      ]);
      await dataSource.query(
        `DELETE FROM "supplier_profiles" WHERE "id" = $1`,
        [supplierProfileId],
      );
      await dataSource.query(`DELETE FROM "branches" WHERE "id" = $1`, [
        branchId,
      ]);
    }

    await closeE2eApp({ app, dataSource });
  });

  it('records and lists purchase-order receipt events through HTTP', async () => {
    const postRes = await request(app.getHttpServer())
      .post(`/api/hub/v1/purchase-orders/${purchaseOrderId}/receipt-events`)
      .send({
        reason: 'Initial delivery received',
        metadata: { dockDoor: 'B2' },
        receiptLines: [
          {
            itemId: purchaseOrderItemId,
            receivedQuantity: 3,
            shortageQuantity: 1,
            damagedQuantity: 1,
            note: 'One short and one damaged',
          },
        ],
      })
      .expect(201);

    expect(postRes.body.status).toBe('RECEIVED');
    expect(postRes.body.items[0].receivedQuantity).toBe(3);
    expect(postRes.body.items[0].shortageQuantity).toBe(1);
    expect(postRes.body.items[0].damagedQuantity).toBe(1);

    const getRes = await request(app.getHttpServer())
      .get(`/api/hub/v1/purchase-orders/${purchaseOrderId}/receipt-events`)
      .expect(200);

    expect(Array.isArray(getRes.body)).toBe(true);
    expect(getRes.body.length).toBeGreaterThan(0);
    expect(getRes.body[0].purchaseOrderId).toBe(purchaseOrderId);
    expect(getRes.body[0].receiptLines[0]).toEqual(
      expect.objectContaining({
        itemId: purchaseOrderItemId,
        receivedQuantity: 3,
        shortageQuantity: 1,
        damagedQuantity: 1,
      }),
    );
  });

  it('rejects receipt events whose totals exceed ordered quantity', async () => {
    await request(app.getHttpServer())
      .post(`/api/hub/v1/purchase-orders/${purchaseOrderId}/receipt-events`)
      .send({
        reason: 'Invalid over-receipt',
        receiptLines: [
          {
            itemId: purchaseOrderItemId,
            receivedQuantity: 5,
            shortageQuantity: 1,
            damagedQuantity: 0,
          },
        ],
      })
      .expect(400);
  });
});
