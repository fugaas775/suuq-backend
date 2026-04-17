import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { BranchStaffService } from './branch-staff.service';
import { PosSupportPortalDiagnosticResponseDto } from './dto/pos-support-response.dto';

@ApiTags('POS Support')
@Controller('pos/v1/support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
export class PosSupportController {
  constructor(private readonly branchStaffService: BranchStaffService) {}

  @Get('portal-diagnostics')
  @ApiQuery({ name: 'email', required: true })
  @ApiOkResponse({ type: PosSupportPortalDiagnosticResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async getPortalDiagnostics(@Query('email') email: string) {
    const normalizedEmail = String(email || '')
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      throw new BadRequestException('email query parameter is required');
    }

    return this.branchStaffService.getPortalAccessDiagnosticsByEmail(
      normalizedEmail,
    );
  }
}
