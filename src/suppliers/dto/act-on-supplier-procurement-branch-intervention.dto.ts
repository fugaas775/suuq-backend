import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum SupplierProcurementBranchInterventionAction {
  ACKNOWLEDGE = 'ACKNOWLEDGE',
  ESCALATE = 'ESCALATE',
  ASSIGN = 'ASSIGN',
  RESOLVE = 'RESOLVE',
}

export class ActOnSupplierProcurementBranchInterventionDto {
  @ApiProperty({ enum: SupplierProcurementBranchInterventionAction })
  @IsEnum(SupplierProcurementBranchInterventionAction)
  action!: SupplierProcurementBranchInterventionAction;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeUserId?: number;
}
