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
import { UserRole } from '../users/user.entity'; // <-- Import your UserRole enum

@Controller('vendor-dashboard')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class VendorDashboardController {
  constructor(private readonly dashboardService: VendorDashboardService) {}

  @Get()
  @Roles(UserRole.VENDOR) // <-- Use enum instead of string
  getVendorStats(@Req() req: any) {
    return this.dashboardService.getStats(req.user.id);
  }
}
