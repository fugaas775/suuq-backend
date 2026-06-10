import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class StartBranchRenewalDto {
  @ApiProperty({ example: 'MONTHLY', description: 'MONTHLY | ONE_YEAR' })
  @IsIn(['MONTHLY', 'ONE_YEAR'])
  subscriptionPeriod!: 'MONTHLY' | 'ONE_YEAR';

  @ApiProperty({ example: '+251911234567' })
  @IsString()
  @MinLength(6)
  phoneNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
