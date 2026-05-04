import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { BranchLongTermDebtStatus } from '../entities/branch-long-term-debt.entity';

export class CreateBranchLongTermDebtDto {
  @ApiProperty()
  @IsString()
  lenderName!: string;

  @ApiPropertyOptional({
    enum: BranchLongTermDebtStatus,
    default: BranchLongTermDebtStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(BranchLongTermDebtStatus)
  status?: BranchLongTermDebtStatus;

  @ApiProperty({ example: 120000 })
  @IsNumber()
  @Min(0)
  principalAmount!: number;

  @ApiProperty({ example: 90000 })
  @IsNumber()
  @Min(0)
  outstandingPrincipal!: number;

  @ApiPropertyOptional({ example: 20000, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  currentPortionAmount?: number;

  @ApiPropertyOptional({ example: 0.12 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  interestRate?: number;

  @ApiProperty({ description: 'ISO timestamp for debt issue date' })
  @IsISO8601()
  issuedAt!: string;

  @ApiPropertyOptional({ description: 'ISO timestamp for maturity date' })
  @IsOptional()
  @IsISO8601()
  maturityAt?: string;

  @ApiPropertyOptional({ default: 'ETB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
