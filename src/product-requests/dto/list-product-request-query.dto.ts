import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ProductRequestStatus } from '../entities/product-request.entity';

const toBooleanOrUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return undefined;
};

export class ListProductRequestQueryDto {
  @IsOptional()
  @IsEnum(ProductRequestStatus, {
    message: 'status must be a valid ProductRequestStatus value',
  })
  status?: ProductRequestStatus;

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
  @Transform(toBooleanOrUndefined)
  @IsBoolean()
  includeOffers?: boolean;
}
