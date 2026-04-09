import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PosUserFitCategory } from '../../categories/entities/category.entity';

const POS_USER_FIT_VALUES = Object.values(
  PosUserFitCategory,
) as PosUserFitCategory[];

export class UpdateRetailTenantOnboardingProfileDto {
  @ApiPropertyOptional({ example: 14, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  categoryId?: number | null;

  @ApiPropertyOptional({ enum: POS_USER_FIT_VALUES, nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(POS_USER_FIT_VALUES)
  userFit?: PosUserFitCategory | null;

  @ApiPropertyOptional({ maxLength: 1200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  notes?: string | null;
}
