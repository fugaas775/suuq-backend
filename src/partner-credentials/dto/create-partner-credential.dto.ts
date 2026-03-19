import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartnerType } from '../entities/partner-credential.entity';

export class CreatePartnerCredentialDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsEnum(PartnerType)
  partnerType!: PartnerType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsString()
  @MaxLength(255)
  keyHash!: string;
}
