import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { FindUsersQueryDto } from '../../users/dto/find-users-query.dto';

export class AdminUserListQueryDto extends FindUsersQueryDto {
  @ApiPropertyOptional({ enum: ['0', '1'] })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value).trim(),
  )
  @IsIn(['0', '1'])
  meta?: '0' | '1';

  /** Filter by SellerWorkspace.billingStatus (e.g. TRIAL, ACTIVE, PLAN_SELECTED) */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sellerBilling?: string;
}
