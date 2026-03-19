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
});
