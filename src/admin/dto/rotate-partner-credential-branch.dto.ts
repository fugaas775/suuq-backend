import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class RotatePartnerCredentialBranchDto {
  @ApiProperty({
    example: 12,
    description: 'New branch assignment for the POS partner credential.',
  })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({
    example: 'Terminal moved from main warehouse to kiosk branch.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
