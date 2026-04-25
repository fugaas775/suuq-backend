import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { SupplierStaffRole } from '../entities/supplier-staff-assignment.entity';

export class UpdateSupplierStaffDto {
  @ApiPropertyOptional({ enum: SupplierStaffRole })
  @IsOptional()
  @IsEnum(SupplierStaffRole)
  role?: SupplierStaffRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
