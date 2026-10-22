import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminPosOverviewService } from './admin-pos-overview.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiTags('Admin — Suuq POS')
@Controller('admin/pos')
export class AdminPosOverviewController {
  constructor(private readonly overviewService: AdminPosOverviewService) {}

  /**
   * GET /api/admin/pos/overview
   *
   * Platform-wide snapshot for the admin landing page: branch and supplier
   * counts, who is paying / trialling / lapsed, subscription run-rate (MRR),
   * accounts whose period ends within two weeks, and outstanding equity BNPL.
   */
  @Get('overview')
  @ApiOperation({ summary: 'Suuq POS platform overview (admin)' })
  @ApiOkResponse({ description: 'Platform-wide POS and supplier snapshot' })
  getOverview() {
    return this.overviewService.getOverview();
  }
}
