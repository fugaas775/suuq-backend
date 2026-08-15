import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListBranchEmployeesQueryDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 'ACTIVE', description: 'ACTIVE | INACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateBranchEmployeeDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({ example: 'Dr. Aron Alemayehu' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName!: string;

  @ApiPropertyOptional({ example: 'General Director' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string | null;

  @ApiPropertyOptional({
    example: 40000,
    description: 'Gross monthly pay. Omit when not yet known.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlySalary?: number | null;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 4211, description: 'Login account, if any.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number | null;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsString()
  startedAt?: string | null;

  @ApiPropertyOptional({ example: '2027-07-07' })
  @IsOptional()
  @IsString()
  endedAt?: string | null;

  @ApiPropertyOptional({ example: 'Paid in cash, no bank account.' })
  @IsOptional()
  @IsString()
  note?: string | null;

  /**
   * Accept a name that already exists on the branch's ACTIVE roster.
   *
   * Off by default so a re-run of an import cannot silently double the payroll,
   * but available because two people really can share a name and the honest fix
   * is to say so rather than to make the second one un-hireable.
   */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  allowDuplicateName?: boolean;
}

export class UpdateBranchEmployeeDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 'Dr. Aron Alemayehu' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName?: string;

  @ApiPropertyOptional({ example: 'General Director' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string | null;

  @ApiPropertyOptional({ example: 42000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlySalary?: number | null;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: 'INACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 4211 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number | null;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsString()
  startedAt?: string | null;

  @ApiPropertyOptional({ example: '2027-07-07' })
  @IsOptional()
  @IsString()
  endedAt?: string | null;

  @ApiPropertyOptional({ example: 'Resigned at the end of Sene.' })
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class ListPayrollRunsQueryDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}

export class CreatePayrollRunDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({
    example: '2026-09',
    description: "The month paid, 'YYYY-MM'.",
  })
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  periodKey!: string;

  @ApiPropertyOptional({ example: 'Meskerem 2019 E.C.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string | null;

  @ApiPropertyOptional({
    example: '2026-10-10',
    description: 'Date the money left. Defaults to now.',
  })
  @IsOptional()
  @IsString()
  occurredAt?: string;

  /**
   * Pay only these people. Omit to pay everyone active who has a salary — the
   * ordinary case, and the one the button on the page uses.
   */
  @ApiPropertyOptional({ type: [Number], example: [1, 2, 3] })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  employeeIds?: number[];

  @ApiPropertyOptional({ example: 'Paid in cash on the 10th.' })
  @IsOptional()
  @IsString()
  note?: string | null;
}
