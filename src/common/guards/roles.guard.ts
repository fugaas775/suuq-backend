import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../auth/roles.enum'; // Adjust path as needed

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Console log for required roles
    console.log('RolesGuard: requiredRoles:', requiredRoles);

    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();

    // Console log for user object
    console.log('RolesGuard: user:', user);

    if (!user || !Array.isArray(user.roles)) {
      console.log('RolesGuard: Access denied - user or user.roles missing/invalid');
      return false;
    }

    // Console log for user's roles array
    console.log('RolesGuard: user.roles:', user.roles);

    const hasRole = user.roles.some((role: string) => requiredRoles.includes(role as UserRole));

    // Log the outcome
    if (hasRole) {
      console.log('RolesGuard: Access GRANTED');
    } else {
      console.log('RolesGuard: Access DENIED - missing required role');
    }

    return hasRole;
  }
}