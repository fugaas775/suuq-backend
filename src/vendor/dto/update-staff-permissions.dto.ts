import { IsEnum, IsNotEmpty } from 'class-validator';
import { VendorPermission } from '../vendor-permissions.enum';

export class UpdateStaffPermissionsDto {
  @IsEnum(VendorPermission, { each: true })
  @IsNotEmpty()
  permissions: VendorPermission[];
}
