import { IsString, IsOptional, IsInt, Matches } from 'class-validator';

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  iconUrl?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(mdi:[a-z0-9_\-]+|[a-z0-9_\-]+)$/i, { message: 'iconName must be alphanumeric with dashes/underscores, optional mdi: prefix' })
  iconName?: string;
  /**
   * Only send iconName/iconUrl to perform icons-only edits.
   * When either changes, backend increments iconVersion and appends ?v=.
   */

  @IsInt()
  @IsOptional()
  parentId?: number | null; // Allow setting parent to null for root categories

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}