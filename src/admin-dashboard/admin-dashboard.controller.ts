import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminDashboardService } from './admin-dashboard.service';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator'; // Updated path
import { RolesGuard } from '../common/guards/roles.guard';   // Updated path
import { UserRole } from '../auth/roles.enum';               // Enum path (OK)

@Controller('admin-dashboard')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('summary')
  @Roles(UserRole.ADMIN)
  getSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getSummary({ from, to });
  }

  @Get('analytics')
  @Roles(UserRole.ADMIN)
  getAnalytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    console.log('=== AdminDashboardController.getAnalytics ===');
    return this.dashboardService.getAnalytics({ from, to });
  }
}