import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  PosPortalActivationCandidateDto,
  PosPortalWorkspacePricingDto,
} from './pos-portal-auth-response.dto';

export class CreatePosWorkspaceDto {
  @ApiProperty({ example: 'Airport Retail' })
  @IsString()
  @MaxLength(255)
  businessName!: string;

  @ApiProperty({ example: 'Main Branch' })
  @IsString()
  @MaxLength(255)
  branchName!: string;

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
    example: 'Your first POS workspace was created. Activate it to open POS-S.',
  })
  message!: string;

  @ApiProperty({ type: PosWorkspaceSummaryDto })
  workspace!: PosWorkspaceSummaryDto;

  @ApiProperty({ type: PosPortalWorkspacePricingDto })
  pricing!: PosPortalWorkspacePricingDto;

  @ApiProperty({ type: PosPortalActivationCandidateDto, isArray: true })
  activationCandidates!: PosPortalActivationCandidateDto[];
}
