import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
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
}
