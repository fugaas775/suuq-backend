import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

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

export class SchoolTextbooksOutstandingQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}
