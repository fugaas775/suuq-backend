import { IsNumber, IsString, Min, Length } from 'class-validator';

export class WithdrawalDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsString()
  @Length(9, 15)
  mobileMoneyNumber!: string;
}