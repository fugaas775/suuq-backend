import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaymentProofDto } from '../../subscription-payments/dto/payment-proof.dto';

/** "I have paid for my supplier subscription" — the period plus the proof. */
export class StartSupplierActivationDto extends PaymentProofDto {
  @ApiPropertyOptional({
    enum: ['MONTHLY', 'ONE_YEAR', 'STARTER'],
    example: 'MONTHLY',
  })
  @IsOptional()
  @IsString()
  // STARTER = the paid 14-day trial, for an account that has never subscribed.
  @IsIn(['MONTHLY', 'ONE_YEAR', 'STARTER'])
  subscriptionPeriod?: 'MONTHLY' | 'ONE_YEAR' | 'STARTER';
}
