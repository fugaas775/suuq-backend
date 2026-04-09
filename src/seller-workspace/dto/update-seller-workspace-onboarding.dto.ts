import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSellerWorkspaceOnboardingDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  stepKey!: string;

  @ApiProperty()
  @IsBoolean()
  completed!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}
