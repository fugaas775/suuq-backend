import { IsArray, IsEmail, IsEnum, IsOptional } from 'class-validator';
import { BranchStaffRole } from '../entities/branch-staff-assignment.entity';

export class InviteBranchStaffDto {
  @IsEmail()
  email!: string;

  @IsEnum(BranchStaffRole)
  role!: BranchStaffRole;

  @IsOptional()
  @IsArray()
  permissions?: string[];
}
