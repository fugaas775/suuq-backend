import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BranchInventoryResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  productId!: number;

  @ApiProperty()
  quantityOnHand!: number;

  @ApiProperty()
  reservedQuantity!: number;

  @ApiProperty()
  reservedOnline!: number;

  @ApiProperty()
  reservedStoreOps!: number;

  @ApiProperty()
  inboundOpenPo!: number;

  @ApiProperty()
  outboundTransfers!: number;

  @ApiProperty()
  safetyStock!: number;

  @ApiProperty()
  availableToSell!: number;

  @ApiProperty()
  version!: number;

  @ApiPropertyOptional()
  lastReceivedAt?: Date | null;

  @ApiPropertyOptional()
  lastPurchaseOrderId?: number | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
