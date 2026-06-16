import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Query for the buyer-facing supplier storefront directory — the B2B mirror of
 * a "browse vendors" page. Lists active suppliers that have published offers.
 */
export class SupplierStorefrontDirectoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;
}

/** Query for one supplier's published catalog. */
export class SupplierStorefrontQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId!: number;
}
