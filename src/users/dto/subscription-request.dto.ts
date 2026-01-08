import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class SubscriptionRequestDto {
  @IsString()
  @IsNotEmpty()
  method: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  currency?: string;
}
