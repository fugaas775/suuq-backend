import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const toTrimmedOptionalString = ({ value }: { value: unknown }) =>
  value === undefined || value === null || value === ''
    ? undefined
    : String(value).trim();

export class AdminVendorListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(toTrimmedOptionalString)
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(toTrimmedOptionalString)
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vendorId?: number;

  @IsOptional()
  @IsIn(['name', 'recent', 'popular', 'verifiedAt'])
  sort?: 'name' | 'recent' | 'popular' | 'verifiedAt';

  @IsOptional()
  @IsIn(['APPROVED', 'PENDING', 'REJECTED'])
  verificationStatus?: 'APPROVED' | 'PENDING' | 'REJECTED';

  @IsOptional()
  @IsIn(['certified', 'uncertified'])
  certificationStatus?: 'certified' | 'uncertified';

  @IsOptional()
  @Transform(toTrimmedOptionalString)
  @IsString()
  country?: string;

  @IsOptional()
  @Transform(toTrimmedOptionalString)
  @IsString()
  region?: string;

  @IsOptional()
  @Transform(toTrimmedOptionalString)
  @IsString()
  city?: string;

  @IsOptional()
  @IsIn(['free', 'pro'])
  subscriptionTier?: 'free' | 'pro';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minSales?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minRating?: number;

  @IsOptional()
  @IsIn(['1'])
  meta?: '1';
}
