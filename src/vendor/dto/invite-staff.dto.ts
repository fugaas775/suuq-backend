import { IsEnum, IsNotEmpty, IsEmail } from 'class-validator';
import { VendorPermission } from '../vendor-permissions.enum';

export class InviteStaffDto {
  @IsEmail()
  email: string;

  @IsEnum(VendorPermission, { each: true })
  @IsNotEmpty()
  permissions: VendorPermission[];
}
