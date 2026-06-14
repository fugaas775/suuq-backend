import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SupplierStaffRole } from '../entities/supplier-staff-assignment.entity';

export class UpdateSupplierStaffDto {
  @ApiPropertyOptional({ enum: SupplierStaffRole })
  @IsOptional()
  @IsEnum(SupplierStaffRole)
  role?: SupplierStaffRole;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  permissions?: string[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
