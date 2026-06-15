import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ClosePosRegisterSessionDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({
    example: 1234.5,
    description: 'Closing cash declared by the operator at end-of-shift.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  closingFloat?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description:
      'Client-computed session report (same shape the "Today" tab renders) ' +
      'used to email the branch owner an end-of-shift report. Kept as a free-' +
      'form object so the email mirrors the in-app tab exactly.',
  })
  @IsOptional()
  @IsObject()
  report?: Record<string, any>;

  @ApiPropertyOptional({ example: 'HOTEL' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  serviceFormat?: string;
}
