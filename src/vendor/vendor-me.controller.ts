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
    const userId = req.user.id;
    const staffRecords =
      await this.vendorStaffService.findStoresForUser(userId);

    // Map to a clean response format
    return staffRecords.map((record) => ({
      vendorId: record.vendor.id,
      storeName:
        record.vendor.storeName || record.vendor.displayName || 'Unnamed Store',
      permissions: record.permissions,
      title: record.title,
      joinedAt: record.createdAt,
    }));
  }
}
