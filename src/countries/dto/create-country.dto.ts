import {
  IsString,
  IsArray,
  IsUrl,
  IsNotEmpty,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

class SupplyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  icon!: string;

  @IsString()
  @IsNotEmpty()
  fact!: string;
}

export class CreateCountryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsUrl()
  @IsNotEmpty()
  flagUrl!: string;

  @IsUrl()
  @IsNotEmpty()
  imageUrl!: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  defaultLanguage?: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplyDto)
  supplies!: SupplyDto[];
}
