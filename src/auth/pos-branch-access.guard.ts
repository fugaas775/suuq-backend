import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { POS_REQUIRED_PERMISSIONS_KEY } from './decorators/require-pos-permissions.decorator';
import { RETAIL_BRANCH_CONTEXT_KEY } from '../retail/decorators/retail-branch-context.decorator';
import { PosSessionRevocationService } from './pos-session-revocation.service';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';

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
  iat?: number; // JWT issued-at (seconds)
};

@Injectable()
export class PosBranchAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly revocationService: PosSessionRevocationService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

      // Check branch-wide operator session revocation.
      // If a manager called DELETE /operator-sessions after this token was issued,
      // the token is invalid and the operator must sign in again.
      if (tokenType === 'pos_operator' && typeof user.iat === 'number') {
        const isValid = await this.revocationService.isOperatorTokenValid(
          Number(claimedBranchId),
          user.iat,
        );
        if (!isValid) {
          throw new UnauthorizedException(
            'Your operator session has been revoked. Sign in again at the gate screen.',
          );
        }
      }
    }

    if (!requiredPermissions?.length) {
      return true;
    }

    if (this.isManagerLike(user)) {
      return true;
    }

    /* Where the caller's permissions come from, and why it is two places.

       A POS-scoped token STATES them: the gate resolves the roster once and
       stamps a `permissions` claim, so that claim is the answer — including
       when it is empty, which means the clerk really was granted none.

       An ordinary account session states no such claim. It carries `sub`,
       `email` and `roles` and nothing else (AuthService.generateTokens), because
       it is not a POS token — and reading that ABSENCE as "holds none" refused
       every permission-gated POS route to anyone signed in with their own email
       and password instead of unlocked at the gate. Managers never saw it:
       `isManagerLike` above returns before this runs. Operators lost the half of
       the till that WRITES, while keeping the half that takes money.

       SMAG School (#128) collected ETB 1,500 of fees that way on 2026-08-21.
       Taking a fee is two calls: `POST /checkouts/ingest` books the money and is
       role-gated only, then `PATCH /suspended-carts/:id` writes it onto the
       pupil and comes through here. So the money went in five times and the roll
       moved none — the desk saw the full balance still owed and tried again, and
       again. A clerk who can bank a payment has to be able to record it.

       So an absent claim falls back to the roster, which is what the gate would
       have stamped anyway. Nothing is granted that the roster does not already
       hold. */
    const claimedPermissions = Array.isArray(user.permissions)
      ? this.normalizePermissionCodes(user.permissions)
      : null;
    const effectivePermissions =
      claimedPermissions ??
      (await this.resolveRosterPermissions(user.id, routeBranchId));

    const hasPermission = requiredPermissions.some((permission) =>
      effectivePermissions.has(
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

  /**
   * Strip anything that is not part of a permission code before comparing.
   *
   * Codes are A-Z0-9_ by construction, and a staff row written as a Postgres
   * array literal into the comma-separated `permissions` column mints tokens
   * carrying `{"OPEN_REGISTER` and `VIEW_FOLIO_BOARD}` — codes that match
   * nothing, so the FIRST and LAST permission a cashier was granted quietly do
   * not exist. The rows are being repaired, but a token lives 8h and this has to
   * hold for the ones already in tills.
   */
  private normalizePermissionCodes(codes: string[]): Set<string> {
    return new Set(
      codes
        .map((permission) =>
          String(permission || '')
            .replace(/[^A-Za-z0-9_]/g, '')
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    );
  }

  /**
   * What this user is actually granted on this branch, read from the roster.
   *
   * Only reached for a session carrying no permissions claim at all. Scoped to
   * the single branch the route resolved, so it stays one indexed lookup rather
   * than the whole-workspace fan-out the gate does — and returns nothing when
   * there is no branch to scope to, which keeps a route that cannot say which
   * branch it is acting on from being waved through.
   */
  private async resolveRosterPermissions(
    userId?: number,
    branchId?: number | null,
  ): Promise<Set<string>> {
    if (!userId || !branchId) {
      return new Set();
    }

    const assignments = await this.dataSource
      .getRepository(BranchStaffAssignment)
      .find({
        where: { userId, branchId, isActive: true },
        select: { id: true, permissions: true },
      });

    return this.normalizePermissionCodes(
      assignments.flatMap((assignment) => assignment.permissions ?? []),
    );
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
