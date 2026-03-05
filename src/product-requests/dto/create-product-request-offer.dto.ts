import {
  IsInt,
  Min,
  IsOptional,
  IsNumber,
  Matches,
  IsString,
  MaxLength,
  IsDate,
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

const toOptionalDate = ({ value }: { value: unknown }) => {
  if (value === null || typeof value === 'undefined' || value === '') {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? value : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      const year = Number(dmy[3]);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      const isValid =
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day;
      return isValid ? parsed : value;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return value;
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
  @IsDate({ message: 'expiresAt must be a valid date value' })
  @Transform(toOptionalDate)
  expiresAt?: Date;
}
