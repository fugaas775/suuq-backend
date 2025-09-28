import { Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ProductFilterDto } from './ProductFilterDto';

// Extends ProductFilterDto with tuning knobs for tiered fetches
export class TieredProductsDto extends ProductFilterDto {
  // Optional explicit parent category id for sibling discovery.
  // If not provided, it will be inferred from categoryId[0] or categorySlug.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Expose({ name: 'sibling_parent_id' })
  siblingParentId?: number;

  // How many siblings to include (top N by sortOrder). Default: 2
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Expose({ name: 'sibling_count' })
  siblingCount?: number;

  // Per-sibling page size. Default: 6
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Expose({ name: 'per_sibling' })
  perSibling?: number;

  // Parent bucket page size. Default: 12
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Expose({ name: 'parent_limit' })
  parentLimit?: number;

  // Global bucket page size. Default: 12
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Expose({ name: 'global_limit' })
  globalLimit?: number;

  // If true, server will merge buckets into a single list using scoring/weights
  @IsOptional()
  @Type(() => Boolean)
  @Expose({ name: 'merge' })
  merge?: boolean;

  // Final cap for merged list (default 48)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Expose({ name: 'hard_cap' })
  hardCap?: number;

  // If true, attempt to avoid consecutive items from same vendor in merged ordering
  @IsOptional()
  @Type(() => Boolean)
  @Expose({ name: 'anti_clump' })
  antiClump?: boolean;
}
