import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum RetailDesktopSyncFailedEntryPriorityFilter {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
}

export class RetailDesktopSyncFailedEntriesQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({
    enum: RetailDesktopSyncFailedEntryPriorityFilter,
    description: 'Limit failed entries to a desktop triage priority.',
  })
  @IsOptional()
  @IsEnum(RetailDesktopSyncFailedEntryPriorityFilter)
  priority?: RetailDesktopSyncFailedEntryPriorityFilter;

  @ApiPropertyOptional({
    example: 'TRANSFER',
    description: 'Limit failed entries to a movement type, case-insensitive.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  movementType?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Limit failed entries to transfer-linked or counterparty-linked failures.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  transferOnly?: boolean;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  limit = 50;
}
