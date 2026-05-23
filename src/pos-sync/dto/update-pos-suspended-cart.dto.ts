import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsOptional } from 'class-validator';

export class UpdatePosSuspendedCartDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Shallow-merged into the existing suspended-cart metadata jsonb. ' +
      'Used for QSR print tracking (metadata.qsrPrint = { at, by, count }).',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
