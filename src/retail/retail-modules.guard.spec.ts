import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RetailModule } from './entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from './retail-modules.guard';

describe('RetailModulesGuard', () => {
  let guard: RetailModulesGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let retailEntitlementsService: { assertBranchHasModules: jest.Mock };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    retailEntitlementsService = {
      assertBranchHasModules: jest.fn().mockResolvedValue({
        tenant: { id: 5 },
        entitlements: [{ module: RetailModule.POS_CORE }],
      }),
    };
    guard = new RetailModulesGuard(
      reflector as unknown as Reflector,
      retailEntitlementsService as any,
    );
  });

  it('allows requests when no retail modules are required', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(undefined);

    const result = await guard.canActivate({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as any);

    expect(result).toBe(true);
    expect(
      retailEntitlementsService.assertBranchHasModules,
    ).not.toHaveBeenCalled();
  });

  it('resolves branchId from body.branchId by default and loads tenant context', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce([RetailModule.POS_CORE])
      .mockReturnValueOnce(undefined);

    const req: any = { body: { branchId: 8 } };
    const result = await guard.canActivate({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => req }),
    } as any);

    expect(result).toBe(true);
    expect(
      retailEntitlementsService.assertBranchHasModules,
    ).toHaveBeenCalledWith(8, [RetailModule.POS_CORE]);
    expect(req.retailTenant.id).toBe(5);
  });

  it('supports an explicit retail branch context path', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce([RetailModule.DESKTOP_BACKOFFICE])
      .mockReturnValueOnce('params.storeBranchId');

    await guard.canActivate({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ params: { storeBranchId: '22' } }),
      }),
    } as any);

    expect(
      retailEntitlementsService.assertBranchHasModules,
    ).toHaveBeenCalledWith(22, [RetailModule.DESKTOP_BACKOFFICE]);
  });

  it('fails when no branchId can be resolved', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce([RetailModule.INVENTORY_CORE])
      .mockReturnValueOnce(undefined);

    await expect(
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => undefined,
        switchToHttp: () => ({ getRequest: () => ({}) }),
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('propagates entitlement failures', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce([RetailModule.ACCOUNTING])
      .mockReturnValueOnce(undefined);
    retailEntitlementsService.assertBranchHasModules.mockRejectedValueOnce(
      new ForbiddenException('not entitled'),
    );

    await expect(
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => undefined,
        switchToHttp: () => ({ getRequest: () => ({ body: { branchId: 3 } }) }),
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });
});
