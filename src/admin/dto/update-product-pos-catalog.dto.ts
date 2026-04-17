import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateProductPosCatalogDto {
  @ApiPropertyOptional({ example: 'BEVERAGES' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  browseCategory?: string | null;

  @ApiPropertyOptional({ example: 'cup' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  unitOfMeasure?: string | null;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  packagingChargeAmount?: number | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['buna', 'coffee', 'qaxwo'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  aliases?: string[] | null;

  @ApiPropertyOptional({
    type: Object,
    example: { en: 'Coffee', am: 'ቡና' },
  })
  @IsOptional()
  @IsObject()
  localizedNames?: Record<string, string> | null;
}
