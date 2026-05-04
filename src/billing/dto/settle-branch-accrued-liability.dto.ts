import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class SettleBranchAccruedLiabilityDto {
  @ApiPropertyOptional({
    description: 'ISO timestamp for settlement date; defaults to now',
  })
  @IsOptional()
  @IsISO8601()
  settledAt?: string;
}
