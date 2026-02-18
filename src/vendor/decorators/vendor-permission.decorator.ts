import { SetMetadata } from '@nestjs/common';
import { VendorPermission } from '../vendor-permissions.enum';

export const RequireVendorPermission = (permission: VendorPermission) =>
  SetMetadata('vendorPermission', permission);
