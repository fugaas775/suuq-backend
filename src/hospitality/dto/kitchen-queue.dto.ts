import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
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

export enum PosKitchenTicketState {
  PENDING = 'PENDING',
  HELD = 'HELD',
  FIRED = 'FIRED',
  READY = 'READY',
  HANDED_OFF = 'HANDED_OFF',
}

export enum PosHospitalityServiceFormat {
  QSR = 'QSR',
  FSR = 'FSR',
}

export class GetKitchenQueueDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  stationCode?: string;

  @IsOptional()
  @IsEnum(PosKitchenTicketState)
  @Type(() => String)
  state?: PosKitchenTicketState;

  @IsOptional()
  @IsEnum(PosHospitalityServiceFormat)
  @Type(() => String)
  serviceFormat?: PosHospitalityServiceFormat;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class HospitalityTicketActionDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  reason?: string;

  @IsString()
  @Transform(({ value }) => trimString(value))
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimUpperString(value))
  stationCode?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  stationLabel?: string;

  @IsOptional()
  @IsEnum(PosHospitalityServiceFormat)
  @Type(() => String)
  serviceFormat?: PosHospitalityServiceFormat;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  ticketLabel?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  receiptId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  serviceOwner?: string;

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
  billId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  billLabel?: string;

  @IsOptional()
  @IsArray()
  lines?: Array<Record<string, unknown>>;
}
