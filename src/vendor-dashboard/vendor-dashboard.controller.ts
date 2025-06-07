import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { VendorDashboardService } from './vendor-dashboard.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum'; // Adjusted to canonical UserRole enum location

@Controller('vendor-dashboard')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class VendorDashboardController {
  constructor(private readonly dashboardService: VendorDashboardService) {}

  @Get()
  @Roles(UserRole.VENDOR)
  async getVendorStats(@Req() req: any) {
    return this.dashboardService.getStats(req.user.id);
  }
}