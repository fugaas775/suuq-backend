/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsEmail,
  MaxLength,
  Matches,
  Min,
  IsISO8601,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  ProductRequestCondition,
  ProductRequestUrgency,
} from '../entities/product-request.entity';

const toOptionalNumber = ({ value }: { value: unknown }) => {
  if (value === null || typeof value === 'undefined' || value === '') {
    return undefined;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : value;
};

const toUpperOrUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
};

const toOptionalPositiveInt = ({ value }: { value: unknown }) => {
  if (value === null || typeof value === 'undefined' || value === '') {
    return undefined;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return num > 0 ? Math.trunc(num) : undefined;
};

export class ProductRequestLocationDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  country?: string;
}

export class CreateProductRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(toOptionalPositiveInt)
  categoryId?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(toOptionalNumber)
  budgetMin?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(toOptionalNumber)
  budgetMax?: number;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/i, {
    message: 'currency must be a valid ISO 4217 code',
  })
  @Transform(toUpperOrUndefined)
  currency?: string;

  @IsOptional()
  @IsEnum(ProductRequestCondition)
  @Transform(toUpperOrUndefined)
  condition?: ProductRequestCondition;

  @IsOptional()
  @IsEnum(ProductRequestUrgency)
  @Transform(toUpperOrUndefined)
  urgency?: ProductRequestUrgency;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  preferredCity?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/i, {
    message: 'preferredCountry must be a 2-letter ISO country code',
  })
  @Transform(toUpperOrUndefined)
  preferredCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  imageUrl?: string;

  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  expiresAt?: Date;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  // Mobile clients send location as a nested object; we map city -> preferredCity
  // and keep the object for future proofing.
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductRequestLocationDto)
  location?: ProductRequestLocationDto;

  // Guest submission contact fields (not required for authenticated users)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  guestName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(190)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  guestPhone?: string;
}
