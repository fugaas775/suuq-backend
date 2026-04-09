import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosSuspendedCartStatus } from '../entities/pos-suspended-cart.entity';

export class PosSuspendedCartResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  branchId!: number;

  @ApiPropertyOptional()
  registerSessionId?: number | null;

  @ApiPropertyOptional()
  registerId?: string | null;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: PosSuspendedCartStatus })
  status!: PosSuspendedCartStatus;

  @ApiProperty()
  currency!: string;

  @ApiPropertyOptional()
  promoCode?: string | null;

  @ApiProperty()
  itemCount!: number;

  @ApiProperty()
  total!: number;

  @ApiPropertyOptional()
  note?: string | null;

  @ApiProperty({ type: Object })
  cartSnapshot!: Record<string, any>;

  @ApiPropertyOptional({ type: Object })
  metadata?: Record<string, any> | null;

  @ApiPropertyOptional()
  suspendedByUserId?: number | null;

  @ApiPropertyOptional()
  suspendedByName?: string | null;

  @ApiPropertyOptional()
  resumedAt?: Date | null;

  @ApiPropertyOptional()
  resumedByUserId?: number | null;

  @ApiPropertyOptional()
  resumedByName?: string | null;

  @ApiPropertyOptional()
  discardedAt?: Date | null;

  @ApiPropertyOptional()
  discardedByUserId?: number | null;

  @ApiPropertyOptional()
  discardedByName?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PosSuspendedCartPageResponseDto {
  @ApiProperty({ type: [PosSuspendedCartResponseDto] })
  items!: PosSuspendedCartResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
