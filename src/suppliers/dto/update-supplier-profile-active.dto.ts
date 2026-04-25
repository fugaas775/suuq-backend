import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSupplierProfileActiveDto {
  @ApiProperty({
    description:
      'Whether the supplier profile is active. Inactive suppliers are excluded from automated draft creation.',
  })
  @IsBoolean()
  isActive!: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
