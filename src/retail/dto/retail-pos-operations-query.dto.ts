import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class RetailPosOperationsQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 24, required: false, default: 24 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  windowHours = 24;

  @ApiProperty({ example: 5, required: false, default: 5 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  topItemsLimit = 5;
}
