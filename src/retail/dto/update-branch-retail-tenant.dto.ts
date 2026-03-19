import { Type } from 'class-transformer';
import { IsNumber } from 'class-validator';

export class UpdateBranchRetailTenantDto {
  @Type(() => Number)
  @IsNumber()
  retailTenantId!: number;
}
