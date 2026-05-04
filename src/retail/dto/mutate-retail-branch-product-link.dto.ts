import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class MutateRetailBranchProductLinkDto {
  @ApiProperty({ example: 11 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  branchId!: number;

  @ApiProperty({ example: 301 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  productId!: number;
}
