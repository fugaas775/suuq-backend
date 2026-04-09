import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PartnerCredentialAuthGuard } from '../partner-credentials/partner-credential-auth.guard';

@Injectable()
export class PosSyncRequestAuthGuard implements CanActivate {
  private readonly jwtAuthGuard = new JwtAuthGuard();

  constructor(
    private readonly partnerCredentialAuthGuard: PartnerCredentialAuthGuard,
  ) {}

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const apiKey = req.headers['x-api-key'] ?? req.headers['x-partner-key'];

    if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
      return this.partnerCredentialAuthGuard.canActivate(context);
    }

    return this.jwtAuthGuard.canActivate(context);
  }
}
