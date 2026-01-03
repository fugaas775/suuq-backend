import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SubscriptionRequestDto {
  @IsString()
  @IsNotEmpty()
  method: string;

  @IsString()
  @IsOptional()
  reference?: string;
}
