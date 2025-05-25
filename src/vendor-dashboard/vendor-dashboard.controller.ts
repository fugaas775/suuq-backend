import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { VendorDashboardService } from './vendor-dashboard.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('vendor-dashboard')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class VendorDashboardController {
  constructor(private readonly dashboardService: VendorDashboardService) {}

  @Get()
  @Roles('VENDOR')
  getVendorStats(@Req() req: any) {
    return this.dashboardService.getStats(req.user.id);
  }
}
