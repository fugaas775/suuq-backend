import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaymentProofDto } from '../../subscription-payments/dto/payment-proof.dto';

/** "I have paid for my supplier subscription" — the period plus the proof. */
export class StartSupplierActivationDto extends PaymentProofDto {
  @ApiPropertyOptional({ enum: ['MONTHLY', 'ONE_YEAR'], example: 'MONTHLY' })
  @IsOptional()
  @IsString()
  @IsIn(['MONTHLY', 'ONE_YEAR'])
  subscriptionPeriod?: 'MONTHLY' | 'ONE_YEAR';
}
