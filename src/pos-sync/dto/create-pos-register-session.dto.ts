import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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

  @ApiPropertyOptional({
    example: 100.0,
    description: 'Opening cash float declared at the start of the shift.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingFloat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description:
      "When true, the server reuses any open branch session or reopens today's closed session instead of creating a new one. Intended for HOTEL and other shared-register formats.",
  })
  @IsOptional()
  @IsBoolean()
  sharedSession?: boolean;
}
