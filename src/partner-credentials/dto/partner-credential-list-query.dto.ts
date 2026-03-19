import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PartnerCredentialStatus,
  PartnerType,
} from '../entities/partner-credential.entity';

export enum PartnerCredentialSortField {
  NAME = 'name',
  STATUS = 'status',
  CREATED_AT = 'createdAt',
  LAST_USED_AT = 'lastUsedAt',
  UPDATED_AT = 'updatedAt',
}

export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class PartnerCredentialListQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ enum: PartnerType })
  @IsOptional()
  @IsEnum(PartnerType)
  partnerType?: PartnerType;

  @ApiPropertyOptional({ enum: PartnerCredentialStatus })
  @IsOptional()
  @IsEnum(PartnerCredentialStatus)
  status?: PartnerCredentialStatus;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({ example: 'main pos' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    enum: PartnerCredentialSortField,
    example: PartnerCredentialSortField.LAST_USED_AT,
  })
  @IsOptional()
  @IsEnum(PartnerCredentialSortField)
  sortBy?: PartnerCredentialSortField;

  @ApiPropertyOptional({ enum: SortDirection, example: SortDirection.DESC })
  @IsOptional()
  @IsEnum(SortDirection)
  sortDirection?: SortDirection;

  @ApiPropertyOptional({
    enum: PartnerCredentialSortField,
    example: PartnerCredentialSortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(PartnerCredentialSortField)
  secondarySortBy?: PartnerCredentialSortField;

  @ApiPropertyOptional({ enum: SortDirection, example: SortDirection.DESC })
  @IsOptional()
  @IsEnum(SortDirection)
  secondarySortDirection?: SortDirection;
}
