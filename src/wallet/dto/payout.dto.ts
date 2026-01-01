import { IsNumber, Min } from 'class-validator';

export class PayoutDto {
  @IsNumber()
  @Min(1)
  amount: number;
}
