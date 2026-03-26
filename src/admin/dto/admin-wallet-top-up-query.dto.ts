import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { TopUpStatus } from '../../wallet/entities/top-up-request.entity';
import { AdminWalletPageQueryDto } from './admin-wallet-page-query.dto';

export class AdminWalletTopUpQueryDto extends AdminWalletPageQueryDto {
  @ApiPropertyOptional({ enum: TopUpStatus })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value).trim().toUpperCase(),
  )
  @IsEnum(TopUpStatus)
  status?: TopUpStatus;
}
