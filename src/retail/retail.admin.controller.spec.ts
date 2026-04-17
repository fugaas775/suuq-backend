import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { RetailAdminController } from './retail.admin.controller';
import { RetailEntitlementsService } from './retail-entitlements.service';

describe('RetailAdminController', () => {
  let controller: RetailAdminController;
  let retailEntitlementsService: {
    listPlanPresets: jest.Mock;
    listTenants: jest.Mock;
    getTenant: jest.Mock;
    createTenant: jest.Mock;
    applyPlanPreset: jest.Mock;
    assignBranchToTenant: jest.Mock;
    upsertModuleEntitlement: jest.Mock;
    updateOnboardingProfile: jest.Mock;
    updateTenantOwner: jest.Mock;
    createSubscription: jest.Mock;
  };

  beforeEach(async () => {
    retailEntitlementsService = {
      listPlanPresets: jest.fn().mockResolvedValue([]),
      listTenants: jest.fn().mockResolvedValue([]),
      getTenant: jest.fn(),
      createTenant: jest.fn(),
      applyPlanPreset: jest.fn().mockResolvedValue({}),
      assignBranchToTenant: jest.fn(),
      upsertModuleEntitlement: jest.fn(),
      updateOnboardingProfile: jest.fn(),
      updateTenantOwner: jest.fn(),
      createSubscription: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RetailAdminController],
      providers: [
        {
          provide: RetailEntitlementsService,
          useValue: retailEntitlementsService,
        },
        {
          provide: AuthGuard('jwt'),
          useValue: { canActivate: jest.fn(() => true) },
        },
        { provide: RolesGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(RetailAdminController);
  });

  it('delegates plan preset listing to the entitlements service', async () => {
    await controller.listPlanPresets();

    expect(retailEntitlementsService.listPlanPresets).toHaveBeenCalled();
  });

  it('delegates preset application to the entitlements service', async () => {
    await controller.applyPlanPreset(5, {
      presetCode: 'RETAIL_INTELLIGENCE',
    });

    expect(retailEntitlementsService.applyPlanPreset).toHaveBeenCalledWith(5, {
      presetCode: 'RETAIL_INTELLIGENCE',
    });
  });

  it('delegates onboarding profile updates to the entitlements service', async () => {
    await controller.updateOnboardingProfile(
      5,
      {
        categoryId: 14,
        userFit: 'FOOD_SERVICE_PRESET_FIT',
        notes: 'Counter-service rollout',
      },
      {
        user: {
          id: 19,
          email: 'admin@suuq.test',
        },
      } as any,
    );

    expect(
      retailEntitlementsService.updateOnboardingProfile,
    ).toHaveBeenCalledWith(
      5,
      {
        categoryId: 14,
        userFit: 'FOOD_SERVICE_PRESET_FIT',
        notes: 'Counter-service rollout',
      },
      {
        id: 19,
        email: 'admin@suuq.test',
      },
    );
  });

  it('delegates owner updates to the entitlements service', async () => {
    await controller.updateOwner(
      5,
      {
        ownerUserId: 17,
      },
      {
        user: {
          id: 19,
          email: 'admin@suuq.test',
        },
      } as any,
    );

    expect(retailEntitlementsService.updateTenantOwner).toHaveBeenCalledWith(
      5,
      {
        ownerUserId: 17,
      },
      {
        id: 19,
        email: 'admin@suuq.test',
      },
    );
  });
});
