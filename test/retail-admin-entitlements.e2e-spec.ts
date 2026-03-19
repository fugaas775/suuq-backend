import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../src/auth/roles.guard';
import { RetailAdminController } from '../src/retail/retail.admin.controller';
import { RetailEntitlementsService } from '../src/retail/retail-entitlements.service';

describe('RetailAdminController entitlement validation (e2e)', () => {
  let app: INestApplication;
  let retailEntitlementsService: {
    upsertModuleEntitlement: jest.Mock;
    listTenants: jest.Mock;
    listPlanPresets: jest.Mock;
    applyPlanPreset: jest.Mock;
    getTenant: jest.Mock;
    createTenant: jest.Mock;
    assignBranchToTenant: jest.Mock;
    createSubscription: jest.Mock;
  };

  beforeAll(async () => {
    retailEntitlementsService = {
      upsertModuleEntitlement: jest.fn().mockResolvedValue({ ok: true }),
      listTenants: jest.fn(),
      listPlanPresets: jest.fn().mockResolvedValue([
        {
          code: 'RETAIL_INTELLIGENCE',
          name: 'Retail Intelligence',
          modules: [{ module: 'AI_ANALYTICS', enabled: true }],
        },
      ]),
      applyPlanPreset: jest.fn().mockResolvedValue({
        preset: { code: 'RETAIL_INTELLIGENCE' },
        subscription: { planCode: 'RETAIL_INTELLIGENCE' },
        entitlements: [{ module: 'AI_ANALYTICS', enabled: true }],
      }),
      getTenant: jest.fn(),
      createTenant: jest.fn(),
      assignBranchToTenant: jest.fn(),
      createSubscription: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RetailAdminController],
      providers: [
        {
          provide: RetailEntitlementsService,
          useValue: retailEntitlementsService,
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 1, email: 'admin@test.com', roles: ['SUPER_ADMIN'] };
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

  it('rejects invalid replenishment policy payloads before service execution', async () => {
    await request(app.getHttpServer())
      .put('/api/admin/retail-tenants/5/modules/INVENTORY_AUTOMATION')
      .send({
        enabled: true,
        metadata: {
          replenishmentPolicy: {
            submissionMode: 'AUTO_SUBMIT',
            minimumOrderTotal: 0,
          },
        },
      })
      .expect(400);

    expect(
      retailEntitlementsService.upsertModuleEntitlement,
    ).not.toHaveBeenCalled();
  });

  it('accepts valid replenishment policy payloads', async () => {
    await request(app.getHttpServer())
      .put('/api/admin/retail-tenants/5/modules/INVENTORY_AUTOMATION')
      .send({
        enabled: true,
        metadata: {
          replenishmentPolicy: {
            submissionMode: 'AUTO_SUBMIT',
            preferredSupplierProfileId: 42,
            minimumOrderTotal: 250,
            orderWindow: {
              daysOfWeek: [1, 3, 5],
              startHour: 8,
              endHour: 17,
              timeZone: 'Africa/Addis_Ababa',
            },
          },
        },
      })
      .expect(200);

    expect(
      retailEntitlementsService.upsertModuleEntitlement,
    ).toHaveBeenCalledWith(
      5,
      'INVENTORY_AUTOMATION',
      expect.objectContaining({
        enabled: true,
        metadata: expect.objectContaining({
          replenishmentPolicy: expect.objectContaining({
            submissionMode: 'AUTO_SUBMIT',
            preferredSupplierProfileId: 42,
            minimumOrderTotal: 250,
          }),
        }),
      }),
    );
  });

  it('rejects invalid AI analytics metadata before service execution', async () => {
    await request(app.getHttpServer())
      .put('/api/admin/retail-tenants/5/modules/AI_ANALYTICS')
      .send({
        enabled: true,
        metadata: {
          aiAnalyticsPolicy: {
            stalePurchaseOrderHours: 0,
          },
        },
      })
      .expect(400);

    expect(
      retailEntitlementsService.upsertModuleEntitlement,
    ).toHaveBeenCalledTimes(1);
  });

  it('accepts valid AI analytics metadata payloads', async () => {
    await request(app.getHttpServer())
      .put('/api/admin/retail-tenants/5/modules/AI_ANALYTICS')
      .send({
        enabled: true,
        metadata: {
          aiAnalyticsPolicy: {
            stalePurchaseOrderHours: 48,
            targetHealthScore: 90,
          },
        },
      })
      .expect(200);

    expect(
      retailEntitlementsService.upsertModuleEntitlement,
    ).toHaveBeenCalledWith(
      5,
      'AI_ANALYTICS',
      expect.objectContaining({
        enabled: true,
        metadata: expect.objectContaining({
          aiAnalyticsPolicy: expect.objectContaining({
            stalePurchaseOrderHours: 48,
            targetHealthScore: 90,
          }),
        }),
      }),
    );
  });

  it('lists retail plan presets for admin provisioning', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/retail-tenants/plan-presets')
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'RETAIL_INTELLIGENCE',
        }),
      ]),
    );
    expect(retailEntitlementsService.listPlanPresets).toHaveBeenCalled();
  });

  it('applies a retail plan preset to a tenant', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/retail-tenants/5/apply-plan-preset')
      .send({
        presetCode: 'RETAIL_INTELLIGENCE',
      })
      .expect(201);

    expect(retailEntitlementsService.applyPlanPreset).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        presetCode: 'RETAIL_INTELLIGENCE',
      }),
    );
  });
});
