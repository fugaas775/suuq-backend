import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  GuardianPortalChangePasswordDto,
  GuardianPortalLoginDto,
} from './dto/school-guardian.dto';
import { SchoolGuardianService } from './school-guardian.service';

// Same budget as the POS portal's sign-in: ten tries a minute per caller.
const LOGIN_THROTTLE = { default: { ttl: 60_000, limit: 10 } };

/**
 * The parent's own door.
 *
 * `login` checks the password the way every sign-in does and then admits
 * only a user some school holds an active guardianship for. The three
 * guarded routes take a plain JWT — a parent is not branch staff and holds
 * no POS role, so none of the POS guards apply — and the service scopes
 * every read to the pupils linked to THAT user. No branch id, no folio id
 * the caller names is trusted on its own.
 */
@ApiTags('School Guardian Portal')
@Controller('pos/v1/school/guardian-portal')
export class SchoolGuardianPortalController {
  constructor(private readonly svc: SchoolGuardianService) {}

  private userId(req: AuthenticatedRequest): number {
    return Number((req.user as { id?: number })?.id) || 0;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
  login(@Body() dto: GuardianPortalLoginDto) {
    return this.svc.login(dto.username, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest) {
    return this.svc.me(this.userId(req));
  }

  @Get('pupils/:folioId')
  @UseGuards(JwtAuthGuard)
  pupil(
    @Param('folioId', ParseIntPipe) folioId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.pupil(this.userId(req), folioId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle(LOGIN_THROTTLE)
  changePassword(
    @Body() dto: GuardianPortalChangePasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.changePassword(this.userId(req), dto);
  }
}
