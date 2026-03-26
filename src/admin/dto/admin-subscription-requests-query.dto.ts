import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { SubscriptionRequestStatus } from '../../users/entities/subscription-request.entity';
import { AdminUsersPageQueryDto } from './admin-users-page-query.dto';

export class AdminSubscriptionRequestsQueryDto extends AdminUsersPageQueryDto {
  @ApiPropertyOptional({ enum: SubscriptionRequestStatus })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value).trim().toUpperCase(),
  )
  @IsEnum(SubscriptionRequestStatus)
  status?: SubscriptionRequestStatus;
}
