import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductAliasType } from '../../product-aliases/entities/product-alias.entity';

export class PosCatalogSearchItemResponseDto {
  @ApiProperty()
  productId!: number;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  sku?: string | null;

  @ApiPropertyOptional()
  imageUrl?: string | null;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  unitPrice!: number;

  /**
   * Per-branch retail price from the branch catalog link, or null when the
   * branch has not priced this product. Additive: the register uses it (with
   * catalogLinkSource) to refuse a PO-received SKU that shelf-setup has not
   * priced yet, which would otherwise sell at the supplier's wholesale cost.
   */
  @ApiProperty({ required: false, nullable: true })
  retailPrice?: number | null;

  /** 'PURCHASE_ORDER' | 'MANUAL' | null — provenance of the branch catalog link. */
  @ApiProperty({ required: false, nullable: true })
  catalogLinkSource?: string | null;

  @ApiProperty()
  availableToSell!: number;

  @ApiProperty({
    enum: ['HEALTHY', 'LOW_STOCK', 'REORDER_NOW', 'OUT_OF_STOCK'],
  })
  stockStatus!: 'HEALTHY' | 'LOW_STOCK' | 'REORDER_NOW' | 'OUT_OF_STOCK';

  /**
   * True when the product opted into counted stock (`product.manage_stock`).
   * Additive. The register shows a count and refuses the sale at zero for
   * these — a QSR store product — and treats everything else as always
   * available, so the search path has to say which it found.
   */
  @ApiProperty()
  manageStock!: boolean;

  @ApiPropertyOptional({ enum: ProductAliasType })
  matchedAliasType?: ProductAliasType | null;

  @ApiPropertyOptional()
  matchedAliasValue?: string | null;

  @ApiProperty({ type: [String] })
  aliases!: string[];

  @ApiPropertyOptional({ type: Object })
  localizedNames?: Record<string, string> | null;

  @ApiPropertyOptional()
  browseCategory?: string | null;

  @ApiPropertyOptional()
  serviceFormat?: string | null;

  @ApiPropertyOptional()
  unitOfMeasure?: string | null;

  @ApiPropertyOptional()
  packagingChargeAmount?: number | null;
}

export class PosCatalogSearchResponseDto {
  @ApiProperty({ type: [PosCatalogSearchItemResponseDto] })
  items!: PosCatalogSearchItemResponseDto[];
}
