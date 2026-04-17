import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function trimUpperString(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

class HospitalityBillContextDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  receiptId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  tableId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  tableLabel?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  billLabel?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  serviceOwner?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  itemCount?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  total?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimUpperString(value))
  currency?: string;
}

export class SplitOpenBillDto extends HospitalityBillContextDto {
  @IsArray()
  @ArrayMinSize(1)
  lineIds!: string[];

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  targetBillLabel?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  reason?: string;

  @IsString()
  @Transform(({ value }) => trimString(value))
  idempotencyKey!: string;
}

export class ReopenSettledBillDto extends HospitalityBillContextDto {
  @IsString()
  @Transform(({ value }) => trimString(value))
  reason!: string;

  @IsBoolean()
  confirmed!: boolean;

  @IsString()
  @Transform(({ value }) => trimString(value))
  idempotencyKey!: string;
}

export class VoidSettledBillDto extends HospitalityBillContextDto {
  @IsString()
  @Transform(({ value }) => trimString(value))
  reason!: string;

  @IsBoolean()
  confirmed!: boolean;

  @IsString()
  @Transform(({ value }) => trimString(value))
  idempotencyKey!: string;
}

export class GetBillInterventionsDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimUpperString(value))
  actionType?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimUpperString(value))
  priority?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
