import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * Reset a manual supplier-staff login's password. Manual logins have no email,
 * so a manager-driven reset is the only recovery path (mirrors branch staff).
 */
export class ChangeSupplierStaffPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
