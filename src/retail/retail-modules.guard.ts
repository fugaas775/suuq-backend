import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RETAIL_BRANCH_CONTEXT_KEY } from './decorators/retail-branch-context.decorator';
import { RETAIL_MODULES_KEY } from './decorators/require-retail-modules.decorator';
import { RetailModule } from './entities/tenant-module-entitlement.entity';
import { RetailEntitlementsService } from './retail-entitlements.service';

@Injectable()
export class RetailModulesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly retailEntitlementsService: RetailEntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModules = this.reflector.getAllAndOverride<RetailModule[]>(
      RETAIL_MODULES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredModules || requiredModules.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const configuredBranchPath = this.reflector.getAllAndOverride<string>(
      RETAIL_BRANCH_CONTEXT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const branchId = this.extractBranchId(req, configuredBranchPath);
    if (branchId == null) {
      throw new BadRequestException(
        'Unable to resolve branchId for Retail OS entitlement check',
      );
    }

    const resolved =
      await this.retailEntitlementsService.assertBranchHasModules(
        branchId,
        requiredModules,
      );

    req.retailTenant = resolved.tenant;
    req.retailEntitlements = resolved.entitlements;
    return true;
  }

  private extractBranchId(req: any, configuredPath?: string): number | null {
    const candidates = [
      configuredPath,
      'body.branchId',
      'params.branchId',
      'query.branchId',
      'user.branchId',
    ].filter(Boolean);

    for (const candidate of candidates) {
      const value = candidate
        .split('.')
        .reduce<any>((current, key) => current?.[key], req);
      if (value == null || value === '') {
        continue;
      }

      const numericValue = Number(value);
      if (!Number.isNaN(numericValue)) {
        return numericValue;
      }
    }

    return null;
  }
}
