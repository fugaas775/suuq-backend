import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../auth/roles.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  private static lastVerboseLogAt = 0; // per-process throttle timestamp

  private verboseEnabled(): boolean {
    return process.env.ROLES_GUARD_DEBUG === '1';
  }

  private maybeLog(requiredRoles: UserRole[] | undefined, user: any, granted: boolean) {
    // Always log denials at DEBUG (can be redirected by logger configuration)
    if (!granted) {
      console.debug('[RolesGuard] DENY user roles=%s required=%s', JSON.stringify(user?.roles), JSON.stringify(requiredRoles));
      return;
    }
    // Only log grants if explicit debug enabled and throttled (every 5s)
    if (this.verboseEnabled()) {
      const now = Date.now();
      if (now - RolesGuard.lastVerboseLogAt > 5000) {
        RolesGuard.lastVerboseLogAt = now;
        console.debug('[RolesGuard] grant user roles=%s satisfies required=%s', JSON.stringify(user?.roles), JSON.stringify(requiredRoles));
      }
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      // No roles required – implicitly granted (do not log unless verbose)
      if (this.verboseEnabled()) {
        this.maybeLog(undefined, context.switchToHttp().getRequest()?.user, true);
      }
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !Array.isArray(user.roles)) {
      this.maybeLog(requiredRoles, user, false);
      return false;
    }

    if (user.roles.includes(UserRole.SUPER_ADMIN)) {
      this.maybeLog(requiredRoles, user, true);
      return true;
    }

    const granted = requiredRoles.some((role) => user.roles.includes(role));
    this.maybeLog(requiredRoles, user, granted);
    return granted;
  }
}
