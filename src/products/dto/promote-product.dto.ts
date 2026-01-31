import { IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BoostTier } from '../boost-pricing.service';

export class PromoteProductDto {
  @ApiProperty({ enum: ['starter', 'popular', 'best_value'] })
  @IsNotEmpty()
  @IsIn(['starter', 'popular', 'best_value'])
  tier: BoostTier;
}
