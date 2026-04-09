import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSellerWorkspaceChannelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  connected?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requested?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}
