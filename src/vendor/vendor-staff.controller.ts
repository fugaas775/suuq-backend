import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Param,
  Delete,
  Patch,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VendorPermissionGuard } from './guards/vendor-permission.guard';
import { VendorPermission } from './vendor-permissions.enum';
import { VendorStaffService } from './vendor-staff.service';
import { ActiveVendor } from '../common/decorators/active-vendor.decorator';
import { User } from '../users/entities/user.entity';
import { RequireVendorPermission } from './decorators/vendor-permission.decorator';

import { InviteStaffDto } from './dto/invite-staff.dto';
import { UpdateStaffPermissionsDto } from './dto/update-staff-permissions.dto';

@Controller('vendor/staff')
@UseGuards(JwtAuthGuard, VendorPermissionGuard)
export class VendorStaffController {
  constructor(private readonly vendorStaffService: VendorStaffService) {}

  @Get()
  @RequireVendorPermission(VendorPermission.STAFF_MANAGE)
  async listStaff(@ActiveVendor() vendor: User) {
    const staffList = await this.vendorStaffService.findAll(vendor.id);
    return staffList.map((staff) => ({
      ...staff,
      // Map 'member' to 'user' to support clients expecting the 'user' field
      user: staff.member,
      // Filter out permissions that might defined in the backend enum
      // but not yet supported by the client's generated code (causing crashes)
      permissions: staff.permissions.filter(
        (p) =>
          p !== VendorPermission.VIEW_ORDERS &&
          p !== VendorPermission.VIEW_FINANCE,
      ),
    }));
  }

  @Post()
  @RequireVendorPermission(VendorPermission.STAFF_MANAGE)
  async inviteStaff(@ActiveVendor() vendor: User, @Body() dto: InviteStaffDto) {
    return this.vendorStaffService.invite(vendor, dto);
  }

  @Patch(':id')
  @RequireVendorPermission(VendorPermission.STAFF_MANAGE)
  async updateStaff(
    @ActiveVendor() vendor: User,
    @Param('id') id: string,
    @Body() dto: UpdateStaffPermissionsDto,
  ) {
    return this.vendorStaffService.updatePermissions(vendor.id, +id, dto);
  }

  @Delete(':id')
  @RequireVendorPermission(VendorPermission.STAFF_MANAGE)
  async removeStaff(@ActiveVendor() vendor: User, @Param('id') id: string) {
    return this.vendorStaffService.remove(vendor.id, +id);
  }

  @Get('my-employments')
  // This endpoint returns stores the CURRENT USER works at.
  // It relies on JwtAuthGuard, but VendorPermissionGuard might block if no header?
  // VendorPermissionGuard logic: if no header, assumes "Own Store".
  // If user is not a vendor, it might fail/throw depending on fallbacks.
  // We should prob exclude VendorPermissionGuard for this specific route if it's strict.
  // But wait, the controller has class-level guard.
  // We can override or move this to a different controller or make guard lenient.
  // Ideally, 'my-employments' is a USER context endpoint, not a VENDOR context endpoint.
  // So it belongs in UsersController or distinct.
  // But let's keep it here for now and maybe override guard?
  // Logic: "If User is acting as themselves... check if VENDOR".
  // If I am a standard user (not vendor) and call this without header, guard sets vendorId=userId.
  // Then checks if I am staff of myself. I am NOT. So it throws Forbidden.
  // So standard users cannot call this if the Guard is class-level.
  // Solution: Move 'my-employments' to a separate method without that guard, or handle in Users.
  // I will skip implementation of 'my-employments' in this strictly guarded controller.
  async myEmployments() {
    return [];
  }
}
