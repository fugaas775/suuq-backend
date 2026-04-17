import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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
  PosPortalActivationCandidateDto,
  PosPortalWorkspacePricingDto,
} from './pos-portal-auth-response.dto';
import { PosUserFitCategory } from '../../categories/entities/category.entity';

export enum SelfServePosWorkspaceServiceFormat {
  RETAIL = 'RETAIL',
  QSR = 'QSR',
  FSR = 'FSR',
}

export class CreatePosWorkspaceDto {
  @ApiProperty({ example: 'Airport Retail' })
  @IsString()
  @MaxLength(255)
  businessName!: string;

  @ApiProperty({ example: 'Main Branch' })
  @IsString()
  @MaxLength(255)
  branchName!: string;

  @ApiPropertyOptional({
    enum: SelfServePosWorkspaceServiceFormat,
    example: 'RETAIL',
  })
  @Transform(({ value }) =>
    String(value || '')
      .trim()
      .toUpperCase(),
  )
  @IsOptional()
  @IsEnum(SelfServePosWorkspaceServiceFormat)
  serviceFormat?: SelfServePosWorkspaceServiceFormat;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: 'Addis Ababa' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  city?: string;

  @ApiPropertyOptional({ example: 'Ethiopia' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  country?: string;

  @ApiPropertyOptional({ example: 'Bole Road' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 14, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  categoryId?: number | null;

  @ApiPropertyOptional({ example: 'cafeteria', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  categorySlug?: string | null;

  @ApiPropertyOptional({ example: 'Cafeteria', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  categoryName?: string | null;

  @ApiPropertyOptional({ enum: PosUserFitCategory, nullable: true })
  @IsOptional()
  @IsEnum(PosUserFitCategory)
  userFit?: PosUserFitCategory | null;
}

export class PosWorkspaceSummaryDto {
  @ApiProperty()
  tenantId!: number;

  @ApiProperty()
  tenantName!: string;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiPropertyOptional({ nullable: true })
  branchCode!: string | null;

  @ApiProperty({ example: 'PAYMENT_REQUIRED' })
  workspaceStatus!: string;
}

export class CreatePosWorkspaceResponseDto {
  @ApiProperty({ example: 'BRANCH_WORKSPACE_ACTIVATION_REQUIRED' })
  onboardingState!: string;

  @ApiProperty({
    example:
      'Your POS-S workspace was created. Start your 15-day free trial to open it.',
  })
  message!: string;

  @ApiProperty({ type: PosWorkspaceSummaryDto })
  workspace!: PosWorkspaceSummaryDto;

  @ApiProperty({ type: PosPortalWorkspacePricingDto })
  pricing!: PosPortalWorkspacePricingDto;

  @ApiProperty({ type: PosPortalActivationCandidateDto, isArray: true })
  activationCandidates!: PosPortalActivationCandidateDto[];

  @ApiPropertyOptional({
    nullable: true,
    example: {
      categoryId: 14,
      categorySlug: 'cafeteria',
      categoryName: 'Cafeteria',
      userFit: 'FOOD_SERVICE_PRESET_FIT',
      suggestedUserFit: 'FOOD_SERVICE_PRESET_FIT',
      notes: null,
    },
  })
  onboardingProfile?: {
    categoryId: number | null;
    categorySlug: string | null;
    categoryName: string | null;
    userFit: PosUserFitCategory | null;
    suggestedUserFit: PosUserFitCategory | null;
    notes: string | null;
  } | null;
}
