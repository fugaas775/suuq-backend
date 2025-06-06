import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from './roles.enum'; // adjust the path as needed

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Use the enum array for typing
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    console.log('=== ROLES GUARD TRIGGERED ===');
    if (!user || !Array.isArray(user.roles)) return false;

    // Cast to UserRole for comparison
    return user.roles.some((role: string) => requiredRoles.includes(role as UserRole));
  }
}
