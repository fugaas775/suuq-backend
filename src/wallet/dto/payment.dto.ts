import { IsNumber, Min, IsString, IsNotEmpty } from 'class-validator';

export class PaymentDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  description: string;
}
