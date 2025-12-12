import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ProductRequestStatus } from '../entities/product-request.entity';

const toNumberArray = ({ value }: { value: unknown }) => {
  if (value === null || typeof value === 'undefined' || value === '') {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const nums = raw
    .map((v) => {
      const num = Number(v);
      return Number.isFinite(num) ? Math.trunc(num) : undefined;
    })
    .filter((v) => typeof v === 'number' && v > 0);
  return nums.length ? nums : undefined;
};

const toBooleanOrUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return undefined;
};

const toStatusArray = ({ value }: { value: unknown }) => {
  if (value === null || typeof value === 'undefined' || value === '') {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const statuses = raw
    .map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : undefined))
    .filter((v): v is string => Boolean(v)) as ProductRequestStatus[];
  return statuses.length ? statuses : undefined;
};

export class ListProductRequestFeedDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => {
    if (value === null || typeof value === 'undefined' || value === '') {
      return 20;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return 20;
    return Math.min(100, Math.max(1, Math.trunc(num)));
  })
  limit = 20;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => {
    if (value === null || typeof value === 'undefined' || value === '') {
      return 1;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return 1;
    return Math.max(1, Math.trunc(num));
  })
  page = 1;

  @IsOptional()
  @Transform(toNumberArray)
  @IsInt({ each: true })
  categoryIds?: number[];

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  city?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/i, {
    message: 'country must be a 2-letter ISO code',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  country?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/i, {
    message: 'currency must be a 3-letter ISO code',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  currency?: string;

  @IsOptional()
  @Transform(toBooleanOrUndefined)
  @IsBoolean()
  includeInProgress?: boolean;

  @IsOptional()
  @Transform(toBooleanOrUndefined)
  @IsBoolean()
  autoMatchSellerCategories?: boolean;

  @IsOptional()
  @Transform(toStatusArray)
  @IsEnum(ProductRequestStatus, { each: true })
  status?: ProductRequestStatus[];
}
