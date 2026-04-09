import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePosSuspendedCartDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  registerSessionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  registerId?: string;

  @ApiProperty({ example: 'Lane 2 basket' })
  @IsString()
  @MaxLength(255)
  label!: string;

  @ApiProperty({ example: 'ETB' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  promoCode?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  itemCount!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiProperty({ type: Object })
  @IsObject()
  cartSnapshot!: Record<string, any>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
