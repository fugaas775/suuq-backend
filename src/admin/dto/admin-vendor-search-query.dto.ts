import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const toTrimmedOptionalString = ({ value }: { value: unknown }) =>
  value === undefined || value === null || value === ''
    ? undefined
    : String(value).trim();

export class AdminVendorSearchQueryDto {
  @IsOptional()
  @Transform(toTrimmedOptionalString)
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['certified', 'uncertified'])
  certificationStatus?: 'certified' | 'uncertified';

  @IsOptional()
  @IsIn(['free', 'pro'])
  subscriptionTier?: 'free' | 'pro';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(['1'])
  meta?: '1';
}
