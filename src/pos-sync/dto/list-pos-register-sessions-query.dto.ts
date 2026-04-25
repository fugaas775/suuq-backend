import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PosRegisterSessionStatus } from '../entities/pos-register-session.entity';

export class ListPosRegisterSessionsQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: PosRegisterSessionStatus })
  @IsOptional()
  @IsEnum(PosRegisterSessionStatus)
  status?: PosRegisterSessionStatus;

  @ApiPropertyOptional({ example: 'front-register-1' })
  @IsOptional()
  @IsString()
  registerId?: string;

  @ApiPropertyOptional({
    example: '2026-04-01T00:00:00.000Z',
    description:
      'Inclusive lower bound (ISO8601). Returns sessions whose lifespan overlaps the window — i.e. that closed at/after `fromAt` (still-open sessions always overlap the upper bound).',
  })
  @IsOptional()
  @IsISO8601()
  fromAt?: string;

  @ApiPropertyOptional({
    example: '2026-04-01T23:59:59.999Z',
    description:
      'Inclusive upper bound (ISO8601). Returns sessions opened at/before `toAt`.',
  })
  @IsOptional()
  @IsISO8601()
  toAt?: string;
}
