import {
  Controller,
  Get,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { VendorDashboardService } from './vendor-dashboard.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';

@Controller('vendor-dashboard')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.VENDOR)
export class VendorDashboardController {
  constructor(private readonly dashboardService: VendorDashboardService) {}

  @Get('overview')
  async getOverview(@Req() req: any) {
    return this.dashboardService.getOverviewStats(req.user.id);
  }

  @Get('recent-orders')
  async getRecentOrders(@Req() req: any, @Query('limit') limit?: number) {
    return this.dashboardService.getRecentOrders(req.user.id, Number(limit) || 5);
  }

  @Get('top-products')
  async getTopProducts(@Req() req: any, @Query('limit') limit?: number) {
    return this.dashboardService.getTopProducts(req.user.id, Number(limit) || 5);
  }

  @Get('withdrawals')
  async getWithdrawals(@Req() req: any, @Query('limit') limit?: number) {
    return this.dashboardService.getWithdrawals(req.user.id, Number(limit) || 10);
  }

  @Get('products')
  async getProducts(@Req() req: any, @Query() query: any) {
    return this.dashboardService.getVendorProducts(req.user.id, query);
  }

  @Get('sales-graph')
  async getSalesGraph(@Req() req: any, @Query('range') range?: string) {
    // e.g. range = '30d', '7d', '12m'
    return this.dashboardService.getSalesGraph(req.user.id, range || '30d');
  }
}