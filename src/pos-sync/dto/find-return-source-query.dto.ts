import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString } from 'class-validator';

// Query for GET /pos/v1/checkouts/return-source — pull up a source SALE by its
// receipt number for the returns workflow (so a non-recent receipt, absent from
// the device's local cache, can still be found and returned).
export class FindReturnSourceQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 'R-20260621-0042' })
  @IsString()
  receiptNumber!: string;
}
