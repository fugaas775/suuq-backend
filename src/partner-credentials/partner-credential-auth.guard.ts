import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PartnerCredentialsService } from './partner-credentials.service';
import { PosPartnerScope } from './partner-credential-scopes';

@Injectable()
export class PartnerCredentialAuthGuard implements CanActivate {
  constructor(
    private readonly partnerCredentialsService: PartnerCredentialsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const apiKey =
      req.headers['x-api-key'] ?? req.headers['x-partner-key'] ?? null;

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('Missing partner credential');
    }

    const credential =
      await this.partnerCredentialsService.authenticatePosCredential(apiKey, [
        PosPartnerScope.POS_SYNC_WRITE,
      ]);

    req.partnerCredential = credential;
    req.user = {
      partnerCredentialId: credential.id,
      partnerType: credential.partnerType,
      scopes: credential.scopes ?? [],
      authType: 'partner-credential',
      roles: [],
    };

    return true;
  }
}
