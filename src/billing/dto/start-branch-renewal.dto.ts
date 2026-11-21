import { PaymentProofDto } from '../../subscription-payments/dto/payment-proof.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class StartBranchRenewalDto extends PaymentProofDto {
  @ApiProperty({ example: 'MONTHLY', description: 'MONTHLY | ONE_YEAR' })
  // STARTER = the paid 14-day trial, for a branch that has never subscribed.
  @IsIn(['MONTHLY', 'ONE_YEAR', 'STARTER'])
  subscriptionPeriod!: 'MONTHLY' | 'ONE_YEAR' | 'STARTER';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
