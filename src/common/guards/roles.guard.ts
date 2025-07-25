import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../auth/roles.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get the roles required for the specific route handler or controller
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles are specified for an endpoint, grant access by default.
    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // If the request doesn't have a user object or the user has no roles, deny access.
    if (!user || !Array.isArray(user.roles)) {
      return false;
    }

    // --- ✨ Updated Logic for Role Hierarchy ---

    // 1. If the user has the SUPER_ADMIN role, grant them access to everything immediately.
    if (user.roles.includes(UserRole.SUPER_ADMIN)) {
      return true;
    }

    // 2. For all other users, check if their roles array includes at least one of the required roles.
    return requiredRoles.some((role) => user.roles.includes(role));
  }
}