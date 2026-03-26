import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { PayoutStatus } from '../../wallet/entities/payout-log.entity';
import { AdminWalletPageQueryDto } from './admin-wallet-page-query.dto';

export class AdminWalletPayoutQueryDto extends AdminWalletPageQueryDto {
  @ApiPropertyOptional({ enum: PayoutStatus })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value).trim().toUpperCase(),
  )
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;
}
