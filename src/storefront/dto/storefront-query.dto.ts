import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ALL_SERVICE_FORMAT_CODES } from '../../common/service-formats';

/**
 * Store discovery accepts every known service format.
 *
 * This filter used to allow only six codes, so filtering stores by GROCERY,
 * PHARMACY, BAKERY or any other live format returned a 400 rather than results.
 * It now derives from the shared registry in `src/common/service-formats.ts`.
 */
export const PUBLIC_SERVICE_FORMAT_CODES = ALL_SERVICE_FORMAT_CODES;

export class StorefrontListQueryDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsIn(PUBLIC_SERVICE_FORMAT_CODES)
  serviceFormat?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class StorefrontProductsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class StorefrontHotelRoomsQueryDto {
  /** Filter by room type, e.g. STANDARD, SUITE */
  @IsOptional()
  @IsString()
  roomType?: string;
}
