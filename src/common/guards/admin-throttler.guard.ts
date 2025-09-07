import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getThrottlingMetrics } from '../../metrics/throttling-metrics.service';

// Custom throttler: bypass or relax limits for admin & super admin routes.
@Injectable()
export class AdminThrottlerGuard extends ThrottlerGuard {
  private get metrics() { return getThrottlingMetrics(); }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Default tracker (IP) if no user
    if (!req.user) return req.ip;
    // Use user id to avoid penalizing shared IP for logged-in users
    return `u:${req.user.id}`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<any>();
    const path: string = req.path || '';
    const user = req.user;
  this.metrics?.increment('checked');

    // Environment driven bypass configuration
    const bypassPrefixes = (process.env.THROTTLE_BYPASS_PREFIXES || '/api/health,/api/status')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const bypassRoles = (process.env.THROTTLE_ADMIN_BYPASS_ROLES || 'ADMIN,SUPER_ADMIN')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    // Path-based bypass
    if (bypassPrefixes.some((pref) => path.startsWith(pref))) {
  this.metrics?.increment('skippedByPath');
  this.metrics?.increment('bypassed');
      return true;
    }

    // Role-based bypass (admin area or global if roles configured)
    if (user && Array.isArray(user.roles)) {
      if (user.roles.some((r: string) => bypassRoles.includes(r))) {
        this.metrics?.increment('skippedByRole');
        this.metrics?.increment('bypassed');
        return true;
      }
    }
    const allowed = await super.canActivate(context);
    if (!allowed) {
      this.metrics?.increment('throttled');
    }
    return allowed;
  }
}
