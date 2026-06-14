import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSupplierProfileDto {
  @ApiProperty({ example: 'Rift Valley Wholesalers' })
  @IsString()
  @MaxLength(255)
  companyName!: string;

  @ApiPropertyOptional({ example: 'Rift Valley Wholesalers PLC' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @ApiPropertyOptional({ example: 'ET-0012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  taxId?: string;

  @ApiPropertyOptional({ example: ['ET', 'DJ'], type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(2, { each: true })
  countriesServed?: string[];

  @ApiPropertyOptional({ example: 'Bank: CBE · Acct: 1000123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  payoutDetails?: string;
}
