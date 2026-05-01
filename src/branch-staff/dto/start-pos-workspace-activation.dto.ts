import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class StartPosWorkspaceActivationDto {
  @ApiProperty({ example: 21 })
  @IsInt()
  @Min(1)
  branchId!: number;

  @ApiProperty({ example: '0911223344' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^(09|2519|9)\d{8}$/u, {
    message: 'Phone number must be a valid Ethiopian mobile number.',
  })
  phoneNumber!: string;

  @ApiPropertyOptional({
    description:
      'POS branch subscription period to activate. Defaults to SIX_MONTHS for backward compatibility.',
    enum: ['SIX_MONTHS', 'ONE_YEAR'],
    example: 'SIX_MONTHS',
  })
  @IsOptional()
  @IsString()
  @IsIn(['SIX_MONTHS', 'ONE_YEAR'])
  subscriptionPeriod?: 'SIX_MONTHS' | 'ONE_YEAR';

  @ApiPropertyOptional({
    description: 'Optional referral code from an active equity partner.',
    example: 'PART-XK7Q',
  })
  @IsOptional()
  @IsString()
  referralCode?: string;
}

export class PosWorkspaceActivationPaymentResponseDto {
  @ApiProperty({ example: 21 })
  branchId!: number;

  @ApiProperty({ example: 'Bole Flagship' })
  branchName!: string;

  @ApiProperty({ example: 'POSACT-21-1731100000000' })
  referenceId!: string;

  @ApiProperty({ example: 'PENDING_CONFIRMATION' })
  status!: 'PENDING_CONFIRMATION' | 'ACTIVE';

  @ApiPropertyOptional({
    enum: ['SIX_MONTHS', 'ONE_YEAR'],
    example: 'SIX_MONTHS',
  })
  subscriptionPeriod?: 'SIX_MONTHS' | 'ONE_YEAR';

  @ApiPropertyOptional({ example: 11400 })
  amount?: number;

  @ApiPropertyOptional({ example: 'ETB' })
  currency?: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'https://checkout.example.com',
  })
  checkoutUrl!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '*322#' })
  receiveCode!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Confirm the payment prompt in Ebirr, then return to POS-S.',
  })
  providerMessage!: string | null;
}
