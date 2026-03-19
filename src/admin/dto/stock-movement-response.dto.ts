import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockMovementType } from '../../branches/entities/stock-movement.entity';

export class StockMovementResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  productId!: number;

  @ApiProperty({ enum: StockMovementType })
  movementType!: StockMovementType;

  @ApiProperty()
  quantityDelta!: number;

  @ApiProperty()
  sourceType!: string;

  @ApiPropertyOptional()
  sourceReferenceId?: number | null;

  @ApiPropertyOptional()
  actorUserId?: number | null;

  @ApiPropertyOptional()
  note?: string | null;

  @ApiProperty()
  createdAt!: Date;
}
