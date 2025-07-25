import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from './roles.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // --- DEBUG LOGGING ---
    this.logger.debug('--- RolesGuard Check ---');
    this.logger.debug(`Required Roles: ${JSON.stringify(requiredRoles)}`);
    this.logger.debug(`User from Token: ${JSON.stringify(user)}`);
    // --- END DEBUG LOGGING ---

    if (!user || !user.roles || !Array.isArray(user.roles)) {
      this.logger.warn('Access Denied: User object or roles array is missing.');
      return false;
    }

    const hasRequiredRole =
      user.roles.includes(UserRole.SUPER_ADMIN) || // SUPER_ADMIN bypass
      requiredRoles.some((role) => user.roles.includes(role));

    if (hasRequiredRole) {
      this.logger.debug('Access Granted: User has a required role.');
    } else {
      this.logger.warn('Access Denied: User does not have any of the required roles.');
    }

    return hasRequiredRole;
  }
}