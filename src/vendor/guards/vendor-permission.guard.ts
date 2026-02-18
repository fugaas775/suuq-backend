import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VendorStaffService } from '../vendor-staff.service';
import { VendorPermission } from '../vendor-permissions.enum';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class VendorPermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private vendorStaffService: VendorStaffService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<VendorPermission>(
      'vendorPermission',
      context.getHandler(),
    );

    const request = context.switchToHttp().getRequest();
    const user: User = request.user;

    if (!user) {
      return false; // No logged in user
    }

    // 1. Identify Target Vendor ID
    let vendorId: number;
    const headerVendorId = request.headers['x-vendor-id'];

    if (headerVendorId) {
      vendorId = parseInt(headerVendorId, 10);
      if (isNaN(vendorId)) {
        throw new BadRequestException('Invalid x-vendor-id header');
      }
    } else {
      // Fallback: If user is acting as themselves (Owner mode context implicit)
      vendorId = user.id;
    }

    // 2. Validate Membership & Permission
    const staffRecord = await this.vendorStaffService.validateStaffPermission(
      user.id,
      vendorId,
      requiredPermission,
    );

    if (!staffRecord) {
      if (requiredPermission) {
        throw new ForbiddenException(
          `You do not have the permission: ${requiredPermission} for this vendor store.`,
        );
      } else {
        throw new ForbiddenException(
          'You are not a staff member of this vendor store.',
        );
      }
    }

    // 3. Attach Context to Request
    request.activeVendor = staffRecord.vendor;
    request.vendorStaff = staffRecord;

    return true;
  }
}
