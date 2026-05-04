import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { POS_REQUIRED_PERMISSIONS_KEY } from './decorators/require-pos-permissions.decorator';
import { RETAIL_BRANCH_CONTEXT_KEY } from '../retail/decorators/retail-branch-context.decorator';

type PosScopedRequestUser = {
  id?: number;
  roles?: string[];
  tokenType?: string;
  branchId?: number;
  branchRole?: string;
  permissions?: string[];
  isOwner?: boolean;
  isTenantOwner?: boolean;
  approvalType?: string | null;
};

@Injectable()
export class PosBranchAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = (request.user ?? null) as PosScopedRequestUser | null;

    if (!user) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      POS_REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const configuredBranchPath = this.reflector.getAllAndOverride<string>(
      RETAIL_BRANCH_CONTEXT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const routeBranchId = this.extractBranchId(request, configuredBranchPath);
    const tokenType = String(user.tokenType || '')
      .trim()
      .toLowerCase();
    const claimedBranchId = Number(user.branchId || 0) || null;

    if (tokenType === 'pos_operator' || tokenType === 'pos_manager_approval') {
      if (routeBranchId == null) {
        throw new BadRequestException(
          'Unable to resolve branchId for POS access enforcement.',
        );
      }

      if (
        !claimedBranchId ||
        Number(routeBranchId) !== Number(claimedBranchId)
      ) {
        throw new ForbiddenException(
          'This POS token is not valid for the requested branch.',
        );
      }
    }

    if (!requiredPermissions?.length) {
      return true;
    }

    if (this.isManagerLike(user)) {
      return true;
    }

    const normalizedPermissions = new Set(
      Array.isArray(user.permissions)
        ? user.permissions
            .map((permission) =>
              String(permission || '')
                .trim()
                .toUpperCase(),
            )
            .filter(Boolean)
        : [],
    );

    const hasPermission = requiredPermissions.some((permission) =>
      normalizedPermissions.has(
        String(permission || '')
          .trim()
          .toUpperCase(),
      ),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'Your POS operator token does not include the required branch permission.',
      );
    }

    return true;
  }

  private isManagerLike(user: PosScopedRequestUser): boolean {
    const normalizedRoles = Array.isArray(user.roles)
      ? user.roles
          .map((role) =>
            String(role || '')
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean)
      : [];
    const branchRole = String(user.branchRole || '')
      .trim()
      .toUpperCase();

    return (
      user.isOwner === true ||
      user.isTenantOwner === true ||
      branchRole === 'MANAGER' ||
      normalizedRoles.some((role) =>
        ['SUPER_ADMIN', 'ADMIN', 'POS_MANAGER'].includes(role),
      )
    );
  }

  private extractBranchId(
    request: any,
    configuredPath?: string,
  ): number | null {
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
        .reduce<any>((current, key) => current?.[key], request);

      if (value == null || value === '') {
        continue;
      }

      const numericValue = Number(value);
      if (!Number.isNaN(numericValue) && numericValue > 0) {
        return numericValue;
      }
    }

    return null;
  }
}
