import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WithdrawalStatus } from '../entities/withdrawal.entity';

export class WithdrawalUserSummaryDto {
  @ApiProperty()
  id: number;

  @ApiPropertyOptional()
  displayName?: string | null;

  @ApiPropertyOptional()
  storeName?: string | null;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiPropertyOptional()
  walletBalance?: number | null;
}

export class WithdrawalResponseDto {
  @ApiProperty()
  id: number;

  @ApiPropertyOptional({ type: WithdrawalUserSummaryDto })
  user?: WithdrawalUserSummaryDto;

  @ApiProperty({ description: 'Withdrawal amount' })
  amount: number;

  @ApiProperty({
    description: 'Withdrawal method (e.g. EBIRR, TELEBIRR, BANK_TRANSFER)',
  })
  method: string;

  @ApiPropertyOptional({
    description: 'Provider/account details and disbursement metadata',
  })
  details?: any;

  @ApiProperty({ enum: WithdrawalStatus })
  status: WithdrawalStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Immediate provider transfer reference (when available), extracted from details.disbursementReference',
  })
  providerReference?: string | null;
}
