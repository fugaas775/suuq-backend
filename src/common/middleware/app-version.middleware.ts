import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class AppVersionMiddleware implements NestMiddleware {
  constructor(private readonly settingsService: SettingsService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const appVersion = req.headers['x-app-version'] as string;
    const platform = req.headers['x-platform'] as string; // 'ios' or 'android'

    if (appVersion && platform) {
      const versions =
        await this.settingsService.getSystemSetting('app_versions');
      if (versions && versions[platform]) {
        const minVersion = versions[platform].min_version;
        if (this.isVersionOlder(appVersion, minVersion)) {
          throw new HttpException(
            {
              statusCode: 426,
              message: 'Upgrade Required',
              error:
                'Your app version is too old. Please update to the latest version.',
              min_version: minVersion,
            },
            426,
          );
        }
      }
    }

    next();
  }

  private isVersionOlder(current: string, min: string): boolean {
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
}
