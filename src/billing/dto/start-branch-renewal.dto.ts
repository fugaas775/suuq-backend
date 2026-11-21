import { PaymentProofDto } from '../../subscription-payments/dto/payment-proof.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class StartBranchRenewalDto extends PaymentProofDto {
  @ApiProperty({ example: 'MONTHLY', description: 'MONTHLY | ONE_YEAR' })
  @IsIn(['MONTHLY', 'ONE_YEAR'])
  subscriptionPeriod!: 'MONTHLY' | 'ONE_YEAR';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
