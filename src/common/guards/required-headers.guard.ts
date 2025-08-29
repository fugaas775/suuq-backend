import { CanActivate, ExecutionContext, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class RequiredHeadersGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const version = req.headers['x-app-version'];
    const platform = req.headers['x-platform'];
    if (!version || !platform) {
      throw new BadRequestException('Missing required headers: X-App-Version and X-Platform');
    }
    // Attach to request for later logging
    (req as any).appMeta = { version, platform };
    return true;
  }
}
