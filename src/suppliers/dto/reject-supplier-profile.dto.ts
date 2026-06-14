import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectSupplierProfileDto {
  @ApiPropertyOptional({ example: 'Tax ID could not be verified.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
