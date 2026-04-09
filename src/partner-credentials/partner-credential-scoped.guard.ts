import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PartnerCredentialsService } from './partner-credentials.service';
import { PosPartnerScope } from './partner-credential-scopes';

@Injectable()
abstract class PartnerCredentialScopedGuard implements CanActivate {
  protected constructor(
    private readonly partnerCredentialsService: PartnerCredentialsService,
    private readonly requiredScopes: PosPartnerScope[],
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const apiKey =
      req.headers['x-api-key'] ?? req.headers['x-partner-key'] ?? null;

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('Missing partner credential');
    }

    const credential =
      await this.partnerCredentialsService.authenticatePosCredential(
        apiKey,
        this.requiredScopes,
      );

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

@Injectable()
export class PartnerPosSyncWriteGuard extends PartnerCredentialScopedGuard {
  constructor(partnerCredentialsService: PartnerCredentialsService) {
    super(partnerCredentialsService, [PosPartnerScope.POS_SYNC_WRITE]);
  }
}

@Injectable()
export class PartnerPosCheckoutReadGuard extends PartnerCredentialScopedGuard {
  constructor(partnerCredentialsService: PartnerCredentialsService) {
    super(partnerCredentialsService, [PosPartnerScope.POS_CHECKOUT_READ]);
  }
}

@Injectable()
export class PartnerPosCheckoutWriteGuard extends PartnerCredentialScopedGuard {
  constructor(partnerCredentialsService: PartnerCredentialsService) {
    super(partnerCredentialsService, [PosPartnerScope.POS_CHECKOUT_WRITE]);
  }
}

@Injectable()
export class PartnerPosRegisterReadGuard extends PartnerCredentialScopedGuard {
  constructor(partnerCredentialsService: PartnerCredentialsService) {
    super(partnerCredentialsService, [PosPartnerScope.POS_REGISTER_READ]);
  }
}

@Injectable()
export class PartnerPosRegisterWriteGuard extends PartnerCredentialScopedGuard {
  constructor(partnerCredentialsService: PartnerCredentialsService) {
    super(partnerCredentialsService, [PosPartnerScope.POS_REGISTER_WRITE]);
  }
}
