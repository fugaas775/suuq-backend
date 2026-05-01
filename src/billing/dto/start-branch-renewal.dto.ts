import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class StartBranchRenewalDto {
  @ApiProperty({ example: '6m', description: '6m | 1y' })
  @IsIn(['6m', '1y'])
  subscriptionPeriod!: '6m' | '1y';

  @ApiProperty({ example: '+251911234567' })
  @IsString()
  @MinLength(6)
  phoneNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
