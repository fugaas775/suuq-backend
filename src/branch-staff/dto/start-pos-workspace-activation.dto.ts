import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Matches, Min } from 'class-validator';

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
}

export class StartPosWorkspaceTrialDto {
  @ApiProperty({ example: 21 })
  @IsInt()
  @Min(1)
  branchId!: number;
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

export class PosWorkspaceTrialActivationResponseDto {
  @ApiProperty({ example: 21 })
  branchId!: number;

  @ApiProperty({ example: 'Bole Flagship' })
  branchName!: string;

  @ApiProperty({ example: 'TRIAL' })
  status!: 'TRIAL';

  @ApiPropertyOptional({ nullable: true, example: '2026-04-03T00:00:00.000Z' })
  trialStartedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-04-18T00:00:00.000Z' })
  trialEndsAt!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 15 })
  trialDaysRemaining!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example:
      'The 15-day trial is active. The first monthly charge should begin on Apr 18, 2026.',
  })
  providerMessage!: string | null;
}
