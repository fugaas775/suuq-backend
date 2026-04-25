import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export type BrowseAvailableOffersSort = 'price_asc' | 'leadtime_asc';

export class BrowseAvailableOffersQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsIn(['price_asc', 'leadtime_asc'])
  sortBy?: BrowseAvailableOffersSort = 'price_asc';
}
