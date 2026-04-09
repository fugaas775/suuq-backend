import {
  IsString,
  IsOptional,
  IsInt,
  Matches,
  Min,
  IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PosUserFitCategory } from '../entities/category.entity';

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name?: string;

  @IsOptional()
  nameTranslations?: Record<string, string>;

  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  slug?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(https?:\/\/|\/|data:).+/i, {
    message: 'iconUrl must be http(s), leading-slash path, or data URI',
  })
  @IsOptional()
  iconUrl?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(mdi:[a-z0-9_-]+|[a-z0-9_-]+)$/i, {
    message:
      'iconName must be alphanumeric with dashes/underscores, optional mdi: prefix',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  iconName?: string;
  /**
   * Only send iconName/iconUrl to perform icons-only edits.
   * When either changes, backend increments iconVersion and appends ?v=.
   */

  @IsInt()
  @IsOptional()
  @Transform(({ value }) =>
    value === ''
      ? null
      : value === null || value === undefined
        ? undefined
        : Number(value),
  )
  parentId?: number | null; // Allow setting parent to null for root categories

  @IsInt()
  @IsOptional()
  @Min(0)
  @Transform(({ value }) =>
    value === null || value === undefined || value === ''
      ? undefined
      : Number(value),
  )
  sortOrder?: number;

  @IsEnum(PosUserFitCategory)
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === '' || value === null) {
      return null;
    }

    return typeof value === 'string' ? value.trim().toUpperCase() : value;
  })
  posSuggestedUserFit?: PosUserFitCategory | null;
}
