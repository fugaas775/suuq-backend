import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

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

  @ApiPropertyOptional({
    type: Object,
    description:
      'Replaces the cartSnapshot jsonb wholesale (NOT merged — the snapshot is ' +
      'a self-contained document and a shallow merge would strip nested keys the ' +
      'caller omitted). Lets a board edit a parked folio in place instead of ' +
      'create-then-discard, which would churn the row id every edit. Used by the ' +
      'PRINTING_PRESS job board to advance production status from the card.',
  })
  @IsOptional()
  @IsObject()
  cartSnapshot?: Record<string, any>;

  @ApiPropertyOptional({
    example: 'Hodan Print Co',
    description:
      'Row label. Sent alongside cartSnapshot when an in-place edit renames the ' +
      'folio, so the row does not keep the name it was parked under.',
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'Recomputed line count, when cartSnapshot changes the lines.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  itemCount?: number;

  @ApiPropertyOptional({
    example: 1450,
    description: 'Recomputed cart total, when cartSnapshot changes the lines.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  total?: number;
}
