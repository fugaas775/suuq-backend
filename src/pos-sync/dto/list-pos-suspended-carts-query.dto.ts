import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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

  @ApiPropertyOptional({
    description:
      'Also include consumer orders (registerId IS NULL, consumerSource=SUUQS) alongside register-scoped carts',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeConsumerOrders?: boolean;
}
