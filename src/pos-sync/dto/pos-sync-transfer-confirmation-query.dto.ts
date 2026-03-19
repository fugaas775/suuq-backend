import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class PosSyncTransferConfirmationQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  branchId!: number;
}
