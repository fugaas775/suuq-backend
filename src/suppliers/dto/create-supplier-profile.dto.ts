import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSupplierProfileDto {
  @IsNumber()
  userId!: number;

  @IsString()
  @MaxLength(255)
  companyName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  taxId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countriesServed?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  payoutDetails?: string;
}
