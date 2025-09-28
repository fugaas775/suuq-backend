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
  const rawPath: string = (req.originalUrl || req.url || req.path || '').toString();
  const path = rawPath; // retain original for logging if needed
  const pathLower = rawPath.toLowerCase();
    const user = req.user;
  this.metrics?.increment('checked');

    // Explicitly honor @SkipThrottle metadata (per-route or controller)
    try {
      const reflector: any = (this as any).reflector;
      // Support both legacy and current metadata keys, just in case
      const SKIP_KEYS = ['THROTTLER:SKIP', 'THROTTLER_SKIP', 'skip_throttle'];
      const skip: boolean = SKIP_KEYS.some((k) => reflector?.getAllAndOverride?.(k, [
        context.getHandler?.(),
        context.getClass?.(),
      ]));
      if (skip) {
        this.metrics?.increment('skippedByMeta');
        this.metrics?.increment('bypassed');
        return true;
      }
    } catch {
      // ignore reflector access issues; fall through to normal logic
    }

    // Environment driven bypass configuration
    const bypassPrefixes = (process.env.THROTTLE_BYPASS_PREFIXES || '/api/health,/api/status,/api/vendors/products,/api/vendors/products/batch,/api/admin,/admin,/api/v1/products')
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    const bypassRoles = (process.env.THROTTLE_ADMIN_BYPASS_ROLES || 'ADMIN,SUPER_ADMIN')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);

    // Path-based bypass
  if (bypassPrefixes.some((pref) => pathLower.startsWith(pref))) {
  this.metrics?.increment('skippedByPath');
  this.metrics?.increment('bypassed');
      return true;
    }

    // Role-based bypass (admin area or global if roles configured)
    if (user && Array.isArray(user.roles)) {
      // Normalize roles: support strings or objects with name/role/code fields
      const userRoleNames: string[] = user.roles
        .map((r: any) => {
          if (typeof r === 'string') return r;
          if (r && typeof r === 'object') return r.name || r.role || r.code || '';
          return '';
        })
        .map((s: string) => s.toUpperCase())
        .filter(Boolean);
      if (userRoleNames.some((rn) => bypassRoles.includes(rn))) {
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
