import { Injectable, NestMiddleware, HttpException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class AppVersionMiddleware implements NestMiddleware {
  constructor(private readonly settingsService: SettingsService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const appVersion = req.headers['x-app-version'] as string;
    const appBuildHeader = req.headers['x-app-build'] as string;
    const platform = req.headers['x-platform'] as string; // 'ios' or 'android'

    if (appVersion && platform) {
      const policy = await this.settingsService.getAppVersionPolicy(platform);
      if (policy) {
        const currentBuild = this.parseBuild(appBuildHeader);
        const belowMinVersion = this.isVersionOlder(
          appVersion,
          policy.min_version,
        );
        const belowMinBuild =
          currentBuild !== null &&
          policy.min_build > 0 &&
          currentBuild < policy.min_build;
        const forcedByLatest = policy.force_update
          ? this.shouldForceUpdate(appVersion, currentBuild, policy)
          : false;

        if (belowMinVersion || belowMinBuild || forcedByLatest) {
          const reason = belowMinBuild
            ? 'min_build'
            : belowMinVersion
              ? 'min_version'
              : 'force_update';
          throw new HttpException(
            {
              statusCode: 426,
              message: 'Upgrade Required',
              error:
                'Your app version is too old. Please update to the latest version.',
              reason,
              platform: platform.toLowerCase(),
              min_version: policy.min_version,
              latest_version: policy.latest_version,
              min_build: policy.min_build,
              latest_build: policy.latest_build,
              force_update: policy.force_update,
              store_url: policy.store_url,
              update_message: policy.message,
            },
            426,
          );
        }
      }
    }

    next();
  }

  private isVersionOlder(current: string, min: string): boolean {
    if (!String(min || '').trim()) {
      return false;
    }

    const currentParts = current.split('.').map(Number);
    const minParts = min.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, minParts.length); i++) {
      const c = currentParts[i] || 0;
      const m = minParts[i] || 0;
      if (c < m) return true;
      if (c > m) return false;
    }
    return false;
  }

  private parseBuild(value?: string | null): number | null {
    const parsed = Number(String(value || '').trim());
    return Number.isFinite(parsed) ? Math.floor(parsed) : null;
  }

  private shouldForceUpdate(
    currentVersion: string,
    currentBuild: number | null,
    policy: {
      latest_version: string;
      latest_build: number;
    },
  ): boolean {
    if (currentBuild !== null && policy.latest_build > 0) {
      return currentBuild < policy.latest_build;
    }

    return this.isVersionOlder(currentVersion, policy.latest_version);
  }
}
