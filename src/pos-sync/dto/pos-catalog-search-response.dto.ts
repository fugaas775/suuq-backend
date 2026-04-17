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

  @ApiProperty()
  availableToSell!: number;

  @ApiProperty({
    enum: ['HEALTHY', 'LOW_STOCK', 'REORDER_NOW', 'OUT_OF_STOCK'],
  })
  stockStatus!: 'HEALTHY' | 'LOW_STOCK' | 'REORDER_NOW' | 'OUT_OF_STOCK';

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
  unitOfMeasure?: string | null;

  @ApiPropertyOptional()
  packagingChargeAmount?: number | null;
}

export class PosCatalogSearchResponseDto {
  @ApiProperty({ type: [PosCatalogSearchItemResponseDto] })
  items!: PosCatalogSearchItemResponseDto[];
}
