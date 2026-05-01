import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { BranchExpenseCategory } from '../entities/branch-expense.entity';

export class CreateBranchExpenseDto {
  @ApiProperty({ enum: BranchExpenseCategory })
  @IsEnum(BranchExpenseCategory)
  category!: BranchExpenseCategory;

  @ApiProperty({ example: 1500.0 })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ default: 'ETB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp; defaults to now' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
