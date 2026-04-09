import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from '../entities/pos-checkout.entity';

export class ListPosCheckoutsQueryDto {
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
  @Max(200)
  limit = 20;

  @ApiPropertyOptional({ enum: PosCheckoutStatus })
  @IsOptional()
  @IsEnum(PosCheckoutStatus)
  status?: PosCheckoutStatus;

  @ApiPropertyOptional({ enum: PosCheckoutTransactionType })
  @IsOptional()
  @IsEnum(PosCheckoutTransactionType)
  transactionType?: PosCheckoutTransactionType;

  @ApiPropertyOptional({ example: 'front-register-1' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  registerId?: string;

  @ApiPropertyOptional({ example: 'sess-2026-04-01-a' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  registerSessionId?: number;
}
