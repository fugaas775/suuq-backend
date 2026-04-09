import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePosRegisterSessionDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 'front-register-1' })
  @IsString()
  @MaxLength(128)
  registerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
