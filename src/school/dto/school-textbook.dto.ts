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
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDay } from '../../common/validators/is-calendar-day.validator';

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

  /** The subject this book is for; the subject teacher provides it. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;
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

  /** `null` makes the book everyone's again. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  subject?: string | null;
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
  @IsCalendarDay()
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

/**
 * The office has taken a lost book's charge off the pupil's fees; the loan is
 * unbilled and filed returned.
 */
export class UnbillSchoolTextbookLoanDto {
  @IsInt()
  branchId!: number;
}

export class SchoolTextbooksOutstandingQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}

export class SeedSchoolTextbooksDto {
  @IsInt()
  branchId!: number;

  /** One class, or the whole school when omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  classCode?: string;
}

export class SchoolTextbookSubjectsQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  classCode!: string;
}
