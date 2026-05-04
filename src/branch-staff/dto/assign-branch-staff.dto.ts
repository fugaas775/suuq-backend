import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  BranchStaffCapability,
  BranchStaffRole,
} from '../entities/branch-staff-assignment.entity';

export class AssignBranchStaffDto {
  @Type(() => Number)
  @IsNumber()
  userId!: number;

  @IsEnum(BranchStaffRole)
  role!: BranchStaffRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedSurfaces?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(BranchStaffCapability, { each: true })
  capabilities?: BranchStaffCapability[];
}
