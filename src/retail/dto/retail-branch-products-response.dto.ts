import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RetailBranchProductVendorResponseDto {
  @ApiProperty()
  id!: number;

  @ApiPropertyOptional({ nullable: true })
  storeName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  legalName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  businessLicenseNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  verificationStatus!: string | null;

  @ApiProperty()
  verified!: boolean;

  @ApiPropertyOptional({ type: Object, nullable: true })
  businessLicenseInfo!: Record<string, any> | null;
}

export class RetailBranchProductItemResponseDto {
  @ApiPropertyOptional({ nullable: true })
  inventoryId!: number | null;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiPropertyOptional({ nullable: true })
  branchCode!: string | null;

  @ApiProperty()
  productId!: number;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sku!: string | null;

  @ApiPropertyOptional({ nullable: true })
  barcode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  categoryName!: string | null;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  price!: number;

  @ApiPropertyOptional({ nullable: true })
  salePrice!: number | null;

  @ApiProperty()
  effectivePrice!: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Per-product VAT/sales-tax rate as a decimal fraction (e.g. 0.15 = 15%). When null, callers should fall back to the branch default tax rate.',
    example: 0.15,
  })
  taxRate!: number | null;

  @ApiPropertyOptional({ nullable: true })
  imageUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  status!: string | null;

  @ApiProperty()
  isAssignedToBranch!: boolean;

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
  shortageToSafetyStock!: number;

  @ApiProperty({
    enum: [
      'HEALTHY',
      'LOW_STOCK',
      'REORDER_NOW',
      'OUT_OF_STOCK',
      'NOT_STOCKED',
    ],
  })
  stockStatus!:
    | 'HEALTHY'
    | 'LOW_STOCK'
    | 'REORDER_NOW'
    | 'OUT_OF_STOCK'
    | 'NOT_STOCKED';

  @ApiPropertyOptional({ nullable: true })
  lastReceivedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastPurchaseOrderId!: number | null;

  @ApiProperty()
  productCreatedAt!: Date;

  @ApiProperty()
  productUpdatedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  inventoryUpdatedAt!: Date | null;

  @ApiProperty({ type: RetailBranchProductVendorResponseDto })
  vendor!: RetailBranchProductVendorResponseDto;
}

export class RetailBranchProductsSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiPropertyOptional({ nullable: true })
  branchCode!: string | null;

  @ApiProperty()
  totalProducts!: number;

  @ApiProperty()
  totalSkus!: number;

  @ApiProperty()
  healthyCount!: number;

  @ApiProperty()
  assignedProductCount!: number;

  @ApiProperty()
  unassignedProductCount!: number;

  @ApiProperty()
  publishedCount!: number;

  @ApiProperty()
  outOfStockCount!: number;

  @ApiProperty()
  replenishmentCandidateCount!: number;

  @ApiProperty()
  negativeAvailableCount!: number;

  @ApiProperty()
  inboundOpenPoUnits!: number;

  @ApiProperty()
  committedUnits!: number;

  @ApiPropertyOptional({ nullable: true })
  lastInventoryUpdatedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastUpdatedAt!: Date | null;
}

export class RetailBranchProductsResponseDto {
  @ApiProperty({ type: RetailBranchProductsSummaryResponseDto })
  summary!: RetailBranchProductsSummaryResponseDto;

  @ApiProperty({ type: [RetailBranchProductItemResponseDto] })
  items!: RetailBranchProductItemResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
