import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SupplierStaffRole } from '../entities/supplier-staff-assignment.entity';

export class InviteSupplierStaffDto {
  @ApiProperty({ example: 'teammate@example.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiPropertyOptional({
    enum: SupplierStaffRole,
    default: SupplierStaffRole.OPERATOR,
  })
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
}
