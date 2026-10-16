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
  StudentPortalChangePasswordDto,
  StudentPortalLoginDto,
} from './dto/school-student-account.dto';
import { SchoolStudentAccountService } from './school-student-account.service';

// Same budget as the parents' and the POS portal's sign-in: ten a minute.
const LOGIN_THROTTLE = { default: { ttl: 60_000, limit: 10 } };

/**
 * The pupil's own door.
 *
 * `login` checks the password the way every sign-in does and then admits
 * only a user some school holds an active student account for. The guarded
 * routes take a plain JWT — a pupil is not branch staff and holds no POS
 * role, so none of the POS guards apply — and the service scopes every read
 * to the record linked to THAT user. No branch id, no folio id the caller
 * names is trusted on its own.
 */
@ApiTags('School Student Portal')
@Controller('pos/v1/school/student-portal')
export class SchoolStudentPortalController {
  constructor(private readonly svc: SchoolStudentAccountService) {}

  private userId(req: AuthenticatedRequest): number {
    return Number((req.user as { id?: number })?.id) || 0;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
  login(@Body() dto: StudentPortalLoginDto) {
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
    @Body() dto: StudentPortalChangePasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.changePassword(this.userId(req), dto);
  }
}
