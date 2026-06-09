import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VendorStaffService } from '../vendor-staff.service';
import { VendorPermission } from '../vendor-permissions.enum';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../auth/roles.enum';

@Injectable()
export class VendorPermissionGuard implements CanActivate {
  private readonly logger = new Logger(VendorPermissionGuard.name);

  constructor(
    private reflector: Reflector,
    private vendorStaffService: VendorStaffService,
  ) {}

  private parseVendorId(value: unknown): number | null {
    if (Array.isArray(value)) return this.parseVendorId(value[0]);
    if (value === null || typeof value === 'undefined') return null;
    const num = Number(value);
    if (!Number.isInteger(num) || num <= 0) return null;
    return num;
  }

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
    const headerVendorId = this.parseVendorId(request.headers['x-vendor-id']);
    const bodyVendorId = this.parseVendorId(
      request.body?.vendorId ?? request.body?.vendor_id,
    );
    const queryVendorId = this.parseVendorId(
      request.query?.vendorId ?? request.query?.vendor_id,
    );
    const paramVendorId = this.parseVendorId(
      request.params?.vendorId ?? request.params?.vendor_id,
    );

    if (request.headers['x-vendor-id'] && !headerVendorId) {
      throw new BadRequestException('Invalid x-vendor-id header');
    }

    const resolvedVendorId =
      headerVendorId ?? bodyVendorId ?? queryVendorId ?? paramVendorId;

    if (resolvedVendorId) {
      vendorId = resolvedVendorId;
    } else {
      // Fallback: If user is acting as themselves (Owner mode context implicit)
      vendorId = user.id;
    }

    // 1b. SUPER_ADMIN short-circuit: a platform super admin may act as the
    // owner of ANY vendor store, with full vendor permissions.
    const roles = (user as { roles?: unknown }).roles;
    if (Array.isArray(roles) && roles.includes(UserRole.SUPER_ADMIN)) {
      const adminStaff = await this.vendorStaffService.createSuperAdminStaff(
        user,
        vendorId,
      );
      if (adminStaff) {
        this.logger.log(
          `SUPER_ADMIN impersonation: admin=${user.id} actingAsVendor=${vendorId} ${request?.method} ${request?.originalUrl ?? request?.url}`,
        );
        request.activeVendor = adminStaff.vendor;
        request.vendorStaff = adminStaff;
        return true;
      }
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
