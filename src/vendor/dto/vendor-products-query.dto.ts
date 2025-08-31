import { Expose, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class VendorProductsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  // all | published | unpublished
  @IsOptional()
  @IsIn(['all', 'published', 'unpublished'])
  status?: 'all' | 'published' | 'unpublished';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  // sort by created date by default; can be price_asc/price_desc later
  @IsOptional()
  @IsString()
  sort?: 'created_desc' | 'created_asc';
}
