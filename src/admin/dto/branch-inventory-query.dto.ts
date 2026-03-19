import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class BranchInventoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({ example: 55 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  productId?: number;
}
