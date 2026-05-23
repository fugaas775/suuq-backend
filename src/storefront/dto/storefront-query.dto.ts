import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export enum PublicServiceFormat {
  RETAIL = 'RETAIL',
  HOTEL = 'HOTEL',
  CAFETERIA = 'CAFETERIA',
  QSR = 'QSR',
  FSR = 'FSR',
  BARBER = 'BARBER',
}

export class StorefrontListQueryDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsEnum(PublicServiceFormat)
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
