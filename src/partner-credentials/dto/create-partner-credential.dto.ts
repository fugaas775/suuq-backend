import { ApiPropertyOptional } from '@nestjs/swagger';
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
import {
  POS_PARTNER_SCOPE_INPUT_VALUES,
  PosPartnerScopePreset,
} from '../partner-credential-scopes';

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
  @ApiPropertyOptional({
    enum: PosPartnerScopePreset,
    description:
      'Preferred POS terminal issuance path. When scopes are omitted, this preset determines the issued explicit pos:* scope bundle. Use explicit scopes only for advanced overrides.',
    example: PosPartnerScopePreset.CASHIER_TERMINAL,
  })
  @IsEnum(PosPartnerScopePreset)
  scopePreset?: PosPartnerScopePreset;

  @IsOptional()
  @ApiPropertyOptional({
    isArray: true,
    enum: POS_PARTNER_SCOPE_INPUT_VALUES,
    description:
      'Optional advanced override for POS partner credentials. Prefer scopePreset for standard terminals. Explicit pos:* scopes are preferred. Legacy sync aliases remain accepted for existing keys.',
  })
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsString()
  @MaxLength(255)
  keyHash!: string;
}
