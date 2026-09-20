import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const TEXTBOOK_LOAN_STATUSES = ['ISSUED', 'RETURNED', 'LOST'] as const;

export class ListSchoolTextbookTitlesQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  classCode?: string;
}

export class CreateSchoolTextbookTitleDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  classCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  /** What a replacement costs the family. Optional — the office prices later. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  replacementPrice?: number;
}

/** Rename a title or (un)price it. `replacementPrice: null` clears the price. */
export class UpdateSchoolTextbookTitleDto {
  @IsInt()
  branchId!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  replacementPrice?: number | null;
}

export class ListSchoolTextbookLoansQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  classCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  folioId?: number;

  /** One status only — the desk asks for the LOST books. */
  @IsOptional()
  @IsIn(TEXTBOOK_LOAN_STATUSES)
  status?: (typeof TEXTBOOK_LOAN_STATUSES)[number];
}

export class IssueSchoolTextbooksDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  classCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  folioIds!: number[];

  /** YYYY-MM-DD, the school's own day; today when omitted. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  issuedAt?: string;
}

export class UpdateSchoolTextbookLoanDto {
  @IsInt()
  branchId!: number;

  @IsIn(['ISSUED', 'RETURNED', 'LOST'])
  status!: 'ISSUED' | 'RETURNED' | 'LOST';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/**
 * The office has posted the bill for a lost book onto the pupil's folio and
 * tells the register so: the amount, and the id of the folio line that IS
 * the bill. The register never moves money itself.
 */
export class MarkSchoolTextbookLoanBilledDto {
  @IsInt()
  branchId!: number;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  lineId!: string;
}

export class SchoolTextbooksOutstandingQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}
