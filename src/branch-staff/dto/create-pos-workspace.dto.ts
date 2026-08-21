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
  HOTEL = 'HOTEL',
  PHARMACY = 'PHARMACY',
  GROCERY = 'GROCERY',
  BAKERY = 'BAKERY',
  LAUNDRY = 'LAUNDRY',
  BUTCHERY = 'BUTCHERY',
  GAS_STATION = 'GAS_STATION',
  ELECTRONICS = 'ELECTRONICS',
  QSR = 'QSR',
  CAFETERIA = 'CAFETERIA',
  PROPERTY_RENTAL = 'PROPERTY_RENTAL',
  BARBER = 'BARBER',
  PRINTING_PRESS = 'PRINTING_PRESS',
  SCHOOL = 'SCHOOL',
}

export class CreatePosWorkspaceDto {
  @ApiProperty({ example: 'Airport Retail' })
  @IsString()
  @MaxLength(255)
  businessName!: string;

  /** Defaults to `businessName` — most owners' first branch IS the business. */
  @ApiPropertyOptional({ example: 'Main Branch' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  branchName?: string;

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

  @ApiPropertyOptional({ example: '0911234567' })
  @Transform(({ value }) => String(value ?? '').trim())
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

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

  /**
   * Equity partner who referred this owner.
   *
   * Attribution used to happen at payment, which was the same moment the
   * workspace was created. Now that a first branch opens free until the
   * promotion's deadline, that moment is months later — so the code has to be
   * captured here or the partner loses the referral entirely.
   */
  @ApiPropertyOptional({ example: 'PART-XXXX', nullable: true })
  @Transform(({ value }) =>
    String(value ?? '')
      .trim()
      .toUpperCase(),
  )
  @IsOptional()
  @IsString()
  @MaxLength(32)
  referralCode?: string | null;
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

  @ApiProperty({ example: 'ACTIVE' })
  workspaceStatus!: string;
}

export class PosWorkspaceTrialDto {
  @ApiProperty({ example: 'POS_BRANCH_FREE_2026' })
  planCode!: string;

  /**
   * The deadline, not a duration. Every account's free period ends on the same
   * date, so how many months that is depends on when they signed up — there is
   * no `months` to report any more.
   */
  @ApiProperty({ example: '2026-12-31T20:59:59.999Z', nullable: true })
  endsAt!: string | null;
}

export class CreatePosWorkspaceResponseDto {
  @ApiProperty({ example: 'BRANCH_WORKSPACE_TRIAL_ACTIVE' })
  onboardingState!: string;

  @ApiProperty({
    example: 'Your POS-S workspace is open and free until 31 December 2026.',
  })
  message!: string;

  @ApiProperty({ type: PosWorkspaceSummaryDto })
  workspace!: PosWorkspaceSummaryDto;

  /**
   * Present when the workspace opened on the free period. Null means the branch
   * still needs billing activation before it can open — because the promotion
   * has closed, or because this account already spent its one free workspace.
   */
  @ApiPropertyOptional({ type: PosWorkspaceTrialDto, nullable: true })
  trial?: {
    planCode: string;
    endsAt: string | null;
  } | null;

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
