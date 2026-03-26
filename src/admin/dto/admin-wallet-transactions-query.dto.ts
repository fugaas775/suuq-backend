import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { TransactionType } from '../../wallet/entities/wallet-transaction.entity';
import { AdminWalletPageQueryDto } from './admin-wallet-page-query.dto';

export class AdminWalletTransactionsQueryDto extends AdminWalletPageQueryDto {
  @ApiPropertyOptional({
    enum: [
      ...Object.values(TransactionType),
      'PURCHASE',
      'SUBSCRIPTION_EXTENSION',
    ],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const normalized = String(value).trim().toUpperCase();

    if (normalized === 'PURCHASE') {
      return TransactionType.PAYMENT;
    }

    if (normalized === 'SUBSCRIPTION_EXTENSION') {
      return TransactionType.SUBSCRIPTION;
    }

    return normalized;
  })
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  orderId?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  userId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value).trim(),
  )
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value).trim(),
  )
  @IsDateString()
  endDate?: string;
}
