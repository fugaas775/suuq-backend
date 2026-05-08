import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListHotelFoliosQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({
    example: 'OPEN',
    description: 'Filter by folio status',
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export class OpenFolioDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 'Room 202' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  roomNumber!: string;

  @ApiPropertyOptional({ example: 'Abdi Kadir' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  guestName?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  checkInAt?: string;

  @ApiPropertyOptional({ example: '2026-06-03' })
  @IsOptional()
  @IsDateString()
  checkOutAt?: string;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: 'folio-open-1717200000000-abc' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: 'folio-local-91' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  localRef?: string;
}

export class PostFolioChargeDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({ example: 'ROOM_CHARGES' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  chargeGroupCode?: string;

  @ApiProperty({ example: 'Room Night' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  chargeName!: string;

  @ApiProperty({ example: 400 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity?: number;

  @ApiPropertyOptional({ example: 'folio-charge-folio-local-91-line-room-1' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

export class SettleFolioDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({ example: 'checkout-999' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  checkoutId?: string;

  @ApiPropertyOptional({ example: 'CASH' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  paymentMethod?: string;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  settledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

export class VoidFolioDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({ example: 'Guest cancelled stay' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

export class TransferFolioRoomDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiProperty({ example: 'Room 305' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  newRoomNumber!: string;

  @ApiPropertyOptional({ example: 'Same guest, room upgrade' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  newGuestName?: string;

  @ApiPropertyOptional({ example: 'Room upgrade requested at front desk' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
