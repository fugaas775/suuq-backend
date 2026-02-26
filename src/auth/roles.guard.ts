import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from './roles.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);
  private static lastVerboseLogAt = 0;

  constructor(private reflector: Reflector) {}

  private verboseEnabled(): boolean {
    return process.env.ROLES_GUARD_DEBUG === '1';
  }

  private maybeLog(
    requiredRoles: UserRole[] | undefined,
    user: any,
    granted: boolean,
  ) {
    if (!granted) {
      this.logger.warn(
        `Access Denied: userRoles=${JSON.stringify(user?.roles)} requiredRoles=${JSON.stringify(requiredRoles)}`,
      );
      return;
    }

    if (this.verboseEnabled()) {
      const now = Date.now();
      if (now - RolesGuard.lastVerboseLogAt > 5000) {
        RolesGuard.lastVerboseLogAt = now;
        this.logger.debug(
          `Access Granted: userRoles=${JSON.stringify(user?.roles)} requiredRoles=${JSON.stringify(requiredRoles)}`,
        );
      }
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      'roles',
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.roles || !Array.isArray(user.roles)) {
      this.maybeLog(requiredRoles, user, false);
      return false;
    }

    const hasRequiredRole =
      user.roles.includes(UserRole.SUPER_ADMIN) || // SUPER_ADMIN bypass
      requiredRoles.some((role) => user.roles.includes(role));

    this.maybeLog(requiredRoles, user, !!hasRequiredRole);

    return !!hasRequiredRole;
  }
}
