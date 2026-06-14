import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class StartSupplierActivationDto {
  @ApiProperty({ example: '0911223344', description: 'Ebirr mobile line' })
  @IsString()
  @MaxLength(32)
  phoneNumber!: string;

  @ApiPropertyOptional({ enum: ['MONTHLY', 'ONE_YEAR'], example: 'MONTHLY' })
  @IsOptional()
  @IsString()
  @IsIn(['MONTHLY', 'ONE_YEAR'])
  subscriptionPeriod?: 'MONTHLY' | 'ONE_YEAR';
}
