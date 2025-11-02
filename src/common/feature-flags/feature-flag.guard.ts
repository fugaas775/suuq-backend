import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagsService } from './feature-flags.service';
import { FEATURE_FLAG_KEY } from './feature-flag.decorator';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(private reflector: Reflector, private flags: FeatureFlagsService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest() as any;
    const flagName = this.reflector.getAllAndOverride<string>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!flagName) return true;
    const appVersion = (req.headers['x-app-version'] as string) || undefined;
    const bucketId = (req.user?.id as string) || (req.headers['x-device-id'] as string) || undefined;
    return this.flags.isEnabled(flagName, appVersion, bucketId);
  }
}
