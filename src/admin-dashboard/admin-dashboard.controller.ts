// src/admin-dashboard/admin-dashboard.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminDashboardService } from './admin-dashboard.service';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('admin-dashboard')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('summary')
  @Roles('ADMIN')
  getSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getSummary({ from, to });
  }

  @Get('analytics')
  @Roles('ADMIN')
  getAnalytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getAnalytics({ from, to });
  }
}
