import { IsString, IsInt, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateReportDto {
  @IsInt()
  productId: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  details?: string;
}
