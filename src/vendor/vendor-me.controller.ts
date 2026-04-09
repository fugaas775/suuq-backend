import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VendorStaffService } from './vendor-staff.service';
import { AuthenticatedRequest } from '../auth/auth.types';

@Controller('vendor/me')
@UseGuards(JwtAuthGuard)
export class VendorMeController {
  constructor(private readonly vendorStaffService: VendorStaffService) {}

  @Get('stores')
  async getMyStores(@Req() req: AuthenticatedRequest) {
    return this.vendorStaffService.getStoreSummariesForUser({
      id: req.user.id,
      roles: req.user.roles,
    });
  }
}
