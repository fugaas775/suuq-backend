import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminSupplierReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
