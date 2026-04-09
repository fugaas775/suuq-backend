import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class SellerWorkspaceQueryDto {
  @ApiPropertyOptional({
    example: 24,
    default: 24,
    description: 'Rolling time window in hours for seller overview metrics.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 90)
  windowHours = 24;
}
