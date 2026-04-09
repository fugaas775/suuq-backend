import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PartnerCredentialsService } from '../src/partner-credentials/partner-credentials.service';
import {
  PartnerPosCheckoutReadGuard,
  PartnerPosCheckoutWriteGuard,
  PartnerPosRegisterReadGuard,
  PartnerPosRegisterWriteGuard,
  PartnerPosSyncWriteGuard,
} from '../src/partner-credentials/partner-credential-scoped.guard';
import { PosPartnerScope } from '../src/partner-credentials/partner-credential-scopes';
import { RetailEntitlementsService } from '../src/retail/retail-entitlements.service';
import { RetailModulesGuard } from '../src/retail/retail-modules.guard';
import { PosPartnerCheckoutController } from '../src/pos-sync/pos-partner-checkout.controller';
import { PosPartnerRegisterController } from '../src/pos-sync/pos-partner-register.controller';
import { PosPartnerSyncController } from '../src/pos-sync/pos-partner-sync.controller';
import { PosCheckoutService } from '../src/pos-sync/pos-checkout.service';
import { PosRegisterService } from '../src/pos-sync/pos-register.service';
import { PosSyncService } from '../src/pos-sync/pos-sync.service';

describe('POS partner checkout/register routes (e2e)', () => {
  let app: INestApplication;
  let posCheckoutService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    ingest: jest.Mock;
  };
  let posRegisterService: {
    findSessions: jest.Mock;
    openSession: jest.Mock;
    closeSession: jest.Mock;
    findSuspendedCarts: jest.Mock;
    suspendCart: jest.Mock;
    resumeSuspendedCart: jest.Mock;
    discardSuspendedCart: jest.Mock;
  };
  let posSyncService: {
    ingest: jest.Mock;
  };
  let partnerCredentialsService: {
    authenticatePosCredential: jest.Mock;
    assertCredentialBranchAccess: jest.Mock;
  };

  beforeAll(async () => {
    posCheckoutService = {
      findAll: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 20,
        totalPages: 0,
      }),
      findOne: jest.fn().mockResolvedValue({ id: 71, branchId: 3 }),
      ingest: jest.fn().mockResolvedValue({ id: 71, branchId: 3 }),
    };

    posRegisterService = {
      findSessions: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 20,
        totalPages: 0,
      }),
      openSession: jest.fn().mockResolvedValue({ id: 11, branchId: 3 }),
      closeSession: jest.fn().mockResolvedValue({ id: 11, branchId: 3 }),
      findSuspendedCarts: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 20,
        totalPages: 0,
      }),
      suspendCart: jest.fn().mockResolvedValue({ id: 91, branchId: 3 }),
      resumeSuspendedCart: jest.fn().mockResolvedValue({ id: 91, branchId: 3 }),
      discardSuspendedCart: jest
        .fn()
        .mockResolvedValue({ id: 91, branchId: 3 }),
    };

    posSyncService = {
      ingest: jest.fn().mockResolvedValue({ id: 201, branchId: 3 }),
    };

    partnerCredentialsService = {
      authenticatePosCredential: jest.fn(
        async (apiKey: string, requiredScopes: string[]) => {
          const scopeMap: Record<string, PosPartnerScope[]> = {
            'checkout-read-key': [PosPartnerScope.POS_CHECKOUT_READ],
            'checkout-write-key': [PosPartnerScope.POS_CHECKOUT_WRITE],
            'register-read-key': [PosPartnerScope.POS_REGISTER_READ],
            'register-write-key': [PosPartnerScope.POS_REGISTER_WRITE],
            'sync-write-key': [PosPartnerScope.POS_SYNC_WRITE],
            'full-key': [
              PosPartnerScope.POS_SYNC_WRITE,
              PosPartnerScope.POS_CHECKOUT_READ,
              PosPartnerScope.POS_CHECKOUT_WRITE,
              PosPartnerScope.POS_REGISTER_READ,
              PosPartnerScope.POS_REGISTER_WRITE,
            ],
          };

          const scopes = scopeMap[apiKey] ?? [];
          const hasScope = requiredScopes.some((scope) =>
            scopes.includes(scope as PosPartnerScope),
          );
          if (!hasScope) {
            throw new UnauthorizedException(
              `Partner credential is missing required POS scope: ${requiredScopes.join(', ')}`,
            );
          }

          return {
            id: 9,
            partnerType: 'POS',
            branchId: 3,
            scopes,
          };
        },
      ),
      assertCredentialBranchAccess: jest.fn(
        (credential: any, branchId: number) => {
          if (credential.branchId !== branchId) {
            throw new UnauthorizedException(
              `Partner credential is not authorized for branch ${branchId}`,
            );
          }
        },
      ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        PosPartnerCheckoutController,
        PosPartnerRegisterController,
        PosPartnerSyncController,
      ],
      providers: [
        { provide: PosCheckoutService, useValue: posCheckoutService },
        { provide: PosRegisterService, useValue: posRegisterService },
        { provide: PosSyncService, useValue: posSyncService },
        {
          provide: PartnerCredentialsService,
          useValue: partnerCredentialsService,
        },
        PartnerPosCheckoutReadGuard,
        PartnerPosCheckoutWriteGuard,
        PartnerPosRegisterReadGuard,
        PartnerPosRegisterWriteGuard,
        PartnerPosSyncWriteGuard,
        {
          provide: RetailEntitlementsService,
          useValue: { assertBranchHasModules: jest.fn() },
        },
      ],
    })
      .overrideGuard(RetailModulesGuard)
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

  it('allows partner checkout history reads with checkout-read scope', async () => {
    await request(app.getHttpServer())
      .get('/api/pos/v1/checkouts/partner-history')
      .set('x-api-key', 'checkout-read-key')
      .query({ branchId: 3, page: 1, limit: 20 })
      .expect(200);

    expect(
      partnerCredentialsService.authenticatePosCredential,
    ).toHaveBeenCalledWith('checkout-read-key', [
      PosPartnerScope.POS_CHECKOUT_READ,
    ]);
    expect(posCheckoutService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 3, page: 1, limit: 20 }),
    );
  });

  it('rejects partner checkout writes without checkout-write scope', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/v1/checkouts/partner-ingest')
      .set('x-api-key', 'checkout-read-key')
      .send({
        branchId: 3,
        transactionType: 'SALE',
        currency: 'USD',
        subtotal: 15,
        total: 15,
        occurredAt: '2026-04-01T10:00:00.000Z',
        items: [{ productId: 55, quantity: 1, unitPrice: 15, lineTotal: 15 }],
      })
      .expect(401);

    expect(posCheckoutService.ingest).not.toHaveBeenCalled();
  });

  it('allows partner checkout writes with checkout-write scope', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/v1/checkouts/partner-ingest')
      .set('x-api-key', 'checkout-write-key')
      .send({
        branchId: 3,
        transactionType: 'SALE',
        currency: 'USD',
        subtotal: 15,
        total: 15,
        occurredAt: '2026-04-01T10:00:00.000Z',
        items: [{ productId: 55, quantity: 1, unitPrice: 15, lineTotal: 15 }],
      })
      .expect(201);

    expect(posCheckoutService.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 3, partnerCredentialId: 9 }),
      expect.objectContaining({ id: null, email: null, roles: [] }),
    );
  });

  it('allows partner register session reads with register-read scope', async () => {
    await request(app.getHttpServer())
      .get('/api/pos/v1/register/partner-sessions')
      .set('x-api-key', 'register-read-key')
      .query({ branchId: 3, page: 1, limit: 20 })
      .expect(200);

    expect(posRegisterService.findSessions).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 3, page: 1, limit: 20 }),
    );
  });

  it('rejects partner register writes without register-write scope', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/v1/register/partner-sessions')
      .set('x-api-key', 'register-read-key')
      .send({ branchId: 3, registerId: 'front-1' })
      .expect(401);

    expect(posRegisterService.openSession).not.toHaveBeenCalled();
  });

  it('allows partner register writes with register-write scope', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/v1/register/partner-suspended-carts')
      .set('x-api-key', 'register-write-key')
      .send({
        branchId: 3,
        label: 'Lane 2 basket',
        currency: 'USD',
        itemCount: 1,
        total: 15,
        cartSnapshot: { items: [] },
      })
      .expect(201);

    expect(posRegisterService.suspendCart).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 3 }),
      { id: null, email: null },
    );
  });

  it('rejects partner sync writes without sync-write scope', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/v1/sync/jobs/partner-ingest')
      .set('x-api-key', 'checkout-write-key')
      .send({
        branchId: 3,
        syncType: 'SALES_SUMMARY',
        entries: [{ quantity: 2 }],
      })
      .expect(401);

    expect(posSyncService.ingest).not.toHaveBeenCalled();
  });

  it('allows partner sync writes with sync-write scope', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/v1/sync/jobs/partner-ingest')
      .set('x-api-key', 'sync-write-key')
      .send({
        branchId: 3,
        syncType: 'SALES_SUMMARY',
        entries: [{ quantity: 2 }],
      })
      .expect(201);

    expect(
      partnerCredentialsService.authenticatePosCredential,
    ).toHaveBeenCalledWith('sync-write-key', [PosPartnerScope.POS_SYNC_WRITE]);
    expect(posSyncService.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 3, partnerCredentialId: 9 }),
      expect.objectContaining({ id: null, email: null, roles: [] }),
    );
  });
});
