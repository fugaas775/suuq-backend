import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
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

    // Verify the requesting user is an active staff member of this specific
    // branch. Skip this check for super-admins, admins, and B2B buyers who
    // access branches without a staff assignment.
    const user = req.user as { id?: number; roles?: string[] } | undefined;
    const bypassRoles = new Set(['SUPER_ADMIN', 'ADMIN', 'B2B_BUYER']);
    const isBypassed =
      !user?.id ||
      (Array.isArray(user.roles) && user.roles.some((r) => bypassRoles.has(r)));

    if (!isBypassed) {
      const hasAccess =
        await this.retailEntitlementsService.isUserActiveBranchMember(
          user.id,
          branchId,
        );
      if (!hasAccess) {
        throw new ForbiddenException(
          'You do not have an active staff assignment for this branch.',
        );
      }
    }

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
