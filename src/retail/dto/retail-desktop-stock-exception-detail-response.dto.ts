import { ApiProperty } from '@nestjs/swagger';
import { StockMovementType } from '../../branches/entities/stock-movement.entity';
import { RetailDesktopWorkbenchActionResponseDto } from './retail-desktop-workbench-response.dto';

export class RetailDesktopStockExceptionDetailSummaryResponseDto {
  @ApiProperty()
  movementId!: number;

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

  @ApiProperty({ nullable: true })
  sourceReferenceId!: number | null;

  @ApiProperty({ nullable: true })
  actorUserId!: number | null;

  @ApiProperty({ nullable: true })
  note!: string | null;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'] })
  priority!: 'CRITICAL' | 'HIGH' | 'NORMAL';

  @ApiProperty()
  priorityReason!: string;

  @ApiProperty()
  ageHours!: number;

  @ApiProperty()
  createdAt!: Date;
}

export class RetailDesktopStockExceptionDetailResponseDto {
  @ApiProperty({ type: RetailDesktopStockExceptionDetailSummaryResponseDto })
  summary!: RetailDesktopStockExceptionDetailSummaryResponseDto;

  @ApiProperty({ type: [RetailDesktopWorkbenchActionResponseDto] })
  actions!: RetailDesktopWorkbenchActionResponseDto[];
}
