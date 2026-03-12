import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PartnerType } from '../entities/partner-credential.entity';

export class CreatePartnerCredentialDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsEnum(PartnerType)
  partnerType!: PartnerType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsString()
  @MaxLength(255)
  keyHash!: string;
}
