import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { BranchExpenseCategory } from '../entities/branch-expense.entity';

/**
 * Correct a recorded expense.
 *
 * Every field is optional; whatever is omitted carries over from the row being
 * corrected. There is no partial-update semantics underneath — the old row is
 * voided and a corrected one posted — so this DTO describes the row as it should
 * now read, not a diff.
 */
export class AmendBranchExpenseDto {
  @ApiPropertyOptional({ enum: BranchExpenseCategory })
  @IsOptional()
  @IsEnum(BranchExpenseCategory)
  category?: BranchExpenseCategory;

  @ApiPropertyOptional({ example: 1500.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: 'ISO timestamp' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  /** Why it was wrong. Optional — the correction itself is the record. */
  @ApiPropertyOptional({ example: 'Keyed 15000 instead of 1500.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
