import {
  IsInt,
  Min,
  IsOptional,
  IsNumber,
  Matches,
  IsString,
  MaxLength,
  IsISO8601,
} from 'class-validator';
import { Transform } from 'class-transformer';

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

export class CreateProductRequestOfferDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) =>
    value === null || typeof value === 'undefined' || value === ''
      ? undefined
      : Number(value),
  )
  productId?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(toOptionalNumber)
  price?: number;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/i, {
    message: 'currency must be a valid ISO 4217 code',
  })
  @Transform(toUpperOrUndefined)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  message?: string;

  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  expiresAt?: Date;
}
