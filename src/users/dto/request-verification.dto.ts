import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VerificationDocumentDto {
  @IsString()
  url: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsNumber()
  size?: number;
}

export class BusinessLicenseInfoDto {
  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsString()
  legalCondition?: string;

  @IsOptional()
  @IsString()
  capital?: string;

  @IsOptional()
  @IsString()
  registeredDate?: string;

  @IsOptional()
  @IsString()
  renewalDate?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class RequestVerificationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VerificationDocumentDto)
  documents: VerificationDocumentDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessLicenseInfoDto)
  businessLicenseInfo?: BusinessLicenseInfoDto;
}
