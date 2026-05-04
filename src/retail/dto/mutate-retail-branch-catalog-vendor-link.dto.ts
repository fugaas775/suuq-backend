import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class MutateRetailBranchCatalogVendorLinkDto {
  @ApiProperty({ example: 11 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  branchId!: number;

  @ApiProperty({ example: 88 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  vendorId!: number;
}
