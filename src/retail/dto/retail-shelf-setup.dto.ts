import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Query for the operator "shelf setup" review queue: products auto-staged into a
 * branch catalog from a received purchase order that still need a retail price
 * and/or a listing decision.
 */
export class RetailPendingShelfQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;
}

export class RetailPendingShelfItemDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  productId!: number;

  @ApiPropertyOptional({ nullable: true })
  name!: string | null;

  @ApiPropertyOptional({ nullable: true })
  currency!: string | null;

  @ApiPropertyOptional({ nullable: true })
  imageUrl!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Wholesale cost basis (the supplier offer / product price) used to suggest a retail price.',
  })
  wholesaleCost!: number | null;

  @ApiPropertyOptional({ nullable: true })
  retailPrice!: number | null;

  @ApiProperty()
  consumerVisible!: boolean;

  @ApiPropertyOptional({ nullable: true })
  supplierProfileId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  supplierName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  purchaseOrderId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  linkedAt!: Date | null;
}

/**
 * Operator confirmation of a staged shelf item: set the per-branch retail price,
 * optional sale price, whether to list it on suuq_s, and enrich the product with a
 * category + image (supplier B2B products ship without either).
 */
export class RetailConfirmShelfItemDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({ example: 120.0, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  retailPrice?: number | null;

  @ApiPropertyOptional({ example: 99.0, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  retailSalePrice?: number | null;

  @ApiPropertyOptional({
    description: 'List this product to consumers on suuq_s for this branch.',
  })
  @IsOptional()
  @IsBoolean()
  consumerVisible?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  imageUrl?: string | null;
}

/**
 * Publish a branch's own products to its public shop in one call.
 *
 * The per-product `PATCH .../shelf` above can only confirm a link that already
 * exists, and the only thing that ever creates one is receiving a purchase
 * order. A branch that built its menu in Product Management therefore had a full
 * catalog, an empty public shop, and no way across — this is the way across.
 */
export class RetailPublishBranchShelfDto {
  @ApiProperty({ example: 79 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({
    description:
      'Publish only these products. Omit to publish every product already in this branch catalog.',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  productIds?: number[];

  @ApiPropertyOptional({
    description:
      'Set to false to hide the products again instead of listing them.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  consumerVisible?: boolean;
}

export class RetailPublishBranchShelfResultDto {
  @ApiProperty()
  branchId!: number;

  /** Products the branch catalog holds, before anything was written. */
  @ApiProperty()
  total!: number;

  /** Links created or flipped by this call. */
  @ApiProperty()
  published!: number;

  /** Products that already carried the requested listing state. */
  @ApiProperty()
  unchanged!: number;
}
