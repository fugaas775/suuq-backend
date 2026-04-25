import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RetailBranchProductsQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 1, required: false, default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page = 1;

  @ApiProperty({ example: 20, required: false, default: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ['all', 'published', 'unpublished'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', 'published', 'unpublished'])
  status?: 'all' | 'published' | 'unpublished';

  @ApiPropertyOptional({ example: 128 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  vendorId?: number;

  @ApiPropertyOptional({
    enum: [
      'created_desc',
      'created_asc',
      'views_desc',
      'views_asc',
      'price_asc',
      'price_desc',
      'name_asc',
      'name_desc',
    ],
  })
  @IsOptional()
  @IsString()
  sort?:
    | 'created_desc'
    | 'created_asc'
    | 'views_desc'
    | 'views_asc'
    | 'price_asc'
    | 'price_desc'
    | 'name_asc'
    | 'name_desc';
}
