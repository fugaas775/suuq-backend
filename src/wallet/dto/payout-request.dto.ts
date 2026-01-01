import { IsNumber, IsPositive } from 'class-validator';

export class PayoutRequestDto {
  @IsNumber()
  @IsPositive()
  amount!: number;
}
