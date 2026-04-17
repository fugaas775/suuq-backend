import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export enum PosTableStatus {
  OPEN = 'OPEN',
  SEATED = 'SEATED',
  ORDERING = 'ORDERING',
  COURSED = 'COURSED',
  CHECK_DROPPED = 'CHECK_DROPPED',
  CLOSED = 'CLOSED',
}

export class GetTableBoardDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  areaCode?: string;

  @IsOptional()
  @IsEnum(PosTableStatus)
  @Type(() => String)
  status?: PosTableStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerUserId?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  ownerReference?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  ownerLabel?: string;
}

export class UpdateTableStatusDto {
  @IsEnum(PosTableStatus)
  @Type(() => String)
  nextStatus!: PosTableStatus;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  tableLabel?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  areaCode?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  reason?: string;

  @IsString()
  @Transform(({ value }) => trimString(value))
  idempotencyKey!: string;
}

export class AssignTableOwnerDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerUserId?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  ownerReference?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  ownerLabel?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  tableLabel?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  areaCode?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  reason?: string;

  @IsString()
  @Transform(({ value }) => trimString(value))
  idempotencyKey!: string;
}
