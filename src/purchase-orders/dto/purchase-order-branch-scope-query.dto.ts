import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class PurchaseOrderBranchScopeQueryDto {
  @ApiPropertyOptional({
    description:
      'Optional branch scope for POS-aligned purchase-order reads and mutations.',
    example: 4,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId?: number;
}
