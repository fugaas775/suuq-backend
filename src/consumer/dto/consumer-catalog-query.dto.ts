import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Browsing every consumer-visible shelf at once.
 *
 * Mirrors `ConsumerBranchQueryDto`'s geo and format filters so a shopper
 * narrowing "shops near me" and "things near me" gets the same behaviour from
 * both, and adds the two axes only a cross-shop view needs: free-text over
 * product names and whether the seller is a shop or a wholesaler.
 */
export class ConsumerCatalogQueryDto {
  /** Free text, matched against product name and shop name. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    const arr = Array.isArray(value) ? value : [value];
    return arr
      .map((v: string) => String(v).trim().toUpperCase())
      .filter(Boolean);
  })
  serviceFormat?: string[];

  /** BRANCH = a shop, SUPPLIER = a wholesaler's cash & carry counter. */
  @IsOptional()
  @IsIn(['BRANCH', 'SUPPLIER'])
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  sellerType?: 'BRANCH' | 'SUPPLIER';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  city?: string;

  /** Only this shop's shelf. Lets the same endpoint back a shop page. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  /** Radius in kilometres for proximity search (max 50 km). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(50)
  radius?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  /**
   * Capped at 50 — the same ceiling the branch list uses. A marketplace grid
   * pages; it does not hand a phone the whole country's shelf.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}
