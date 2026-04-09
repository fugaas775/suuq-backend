import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PosSuspendedCartStatus } from '../entities/pos-suspended-cart.entity';

export class ListPosSuspendedCartsQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: PosSuspendedCartStatus })
  @IsOptional()
  @IsEnum(PosSuspendedCartStatus)
  status?: PosSuspendedCartStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  registerSessionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registerId?: string;
}
