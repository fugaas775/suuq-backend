import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../auth/roles.enum';
import {
  BranchStaffCapability,
  BranchStaffRole,
} from '../entities/branch-staff-assignment.entity';
import { RetailModule } from '../../retail/entities/tenant-module-entitlement.entity';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from '../../retail/entities/tenant-subscription.entity';

export class PosPortalUserSummaryDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserRole, isArray: true })
  roles!: UserRole[];

  @ApiPropertyOptional({ nullable: true })
  displayName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl?: string | null;
}

export class PosPortalBranchSummaryDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiPropertyOptional({ nullable: true })
  branchCode!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'RETAIL' })
  serviceFormat!: string | null;

  @ApiProperty({ enum: BranchStaffRole })
  role!: BranchStaffRole;

  @ApiProperty({ isArray: true })
  permissions!: string[];

  @ApiPropertyOptional({ isArray: true, nullable: true })
  assignedSurfaces!: string[] | null;

  @ApiProperty({ enum: BranchStaffCapability, isArray: true })
  capabilities!: string[];

  @ApiProperty()
  isOwner!: boolean;

  @ApiProperty()
  isTenantOwner!: boolean;

  @ApiPropertyOptional({ nullable: true })
  retailTenantId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  retailTenantName!: string | null;

  @ApiProperty({ enum: RetailModule, isArray: true })
  modules!: RetailModule[];

  @ApiPropertyOptional({ example: 'ACTIVE', nullable: true })
  workspaceStatus!: string | null;

  @ApiPropertyOptional({ enum: TenantSubscriptionStatus, nullable: true })
  subscriptionStatus!: TenantSubscriptionStatus | null;

  @ApiPropertyOptional({ nullable: true })
  planCode!: string | null;

  @ApiProperty()
  canStartActivation!: boolean;

  @ApiProperty()
  canOpenNow!: boolean;

  @ApiProperty()
  joinedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  posExperienceProfileCode!: string | null;
}

export class PosPortalSessionResponseDto {
  @ApiProperty({ type: PosPortalUserSummaryDto })
  user!: PosPortalUserSummaryDto;

  @ApiProperty({ type: PosPortalBranchSummaryDto, isArray: true })
  branches!: PosPortalBranchSummaryDto[];

  @ApiPropertyOptional({ nullable: true })
  defaultBranchId!: number | null;

  @ApiProperty()
  requiresBranchSelection!: boolean;

  @ApiProperty({ example: 'pos' })
  portalKey!: string;
}

export class PosPortalAuthResponseDto extends PosPortalSessionResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;
}

export class PosPortalSubscriptionOptionDto {
  @ApiProperty({ enum: ['SIX_MONTHS', 'ONE_YEAR'], example: 'SIX_MONTHS' })
  period!: 'SIX_MONTHS' | 'ONE_YEAR';

  @ApiProperty({ example: 6 })
  months!: number;

  @ApiProperty({ example: 11400 })
  amount!: number;

  @ApiProperty({ example: 'ETB' })
  currency!: string;

  @ApiProperty({ example: '6 months' })
  label!: string;

  @ApiProperty({ example: 'POS_BRANCH_6M' })
  planCode!: string;
}

export class PosPortalWorkspacePricingDto {
  @ApiProperty({ example: 1900 })
  amount!: number;

  @ApiProperty({ example: 'ETB' })
  currency!: string;

  @ApiProperty({
    enum: TenantBillingInterval,
    example: TenantBillingInterval.MONTHLY,
  })
  billingInterval!: TenantBillingInterval;

  @ApiProperty({ example: 'EBIRR' })
  paymentMethod!: string;

  @ApiProperty({ type: PosPortalSubscriptionOptionDto, isArray: true })
  subscriptionOptions!: PosPortalSubscriptionOptionDto[];
}

export class PosPortalActivationCandidateDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiPropertyOptional({ nullable: true })
  branchCode!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'RETAIL' })
  serviceFormat!: string | null;

  @ApiProperty({ enum: BranchStaffRole })
  role!: BranchStaffRole;

  @ApiProperty({ isArray: true })
  permissions!: string[];

  @ApiPropertyOptional({ isArray: true, nullable: true })
  assignedSurfaces!: string[] | null;

  @ApiProperty({ enum: BranchStaffCapability, isArray: true })
  capabilities!: string[];

  @ApiProperty()
  isOwner!: boolean;

  @ApiProperty()
  isTenantOwner!: boolean;

  @ApiPropertyOptional({ nullable: true })
  retailTenantId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  retailTenantName!: string | null;

  @ApiProperty({ example: 'PAYMENT_REQUIRED' })
  workspaceStatus!: string;

  @ApiPropertyOptional({ enum: TenantSubscriptionStatus, nullable: true })
  subscriptionStatus!: TenantSubscriptionStatus | null;

  @ApiPropertyOptional({ nullable: true })
  planCode!: string | null;

  @ApiProperty()
  canStartActivation!: boolean;

  @ApiProperty()
  canOpenNow!: boolean;

  @ApiProperty({ type: [String] })
  activationBlockers!: string[];

  @ApiProperty({ type: PosPortalWorkspacePricingDto })
  pricing!: PosPortalWorkspacePricingDto;
}

export class PosPortalAccessDeniedResponseDto {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: 'POS_PORTAL_ACCESS_DENIED' })
  code!: string;

  @ApiProperty({
    example: 'This account is not linked to any active POS branch workspace.',
  })
  message!: string;

  @ApiPropertyOptional({ example: false })
  accountCreated?: boolean;

  @ApiPropertyOptional({ example: 'ACCOUNT_CREATED_BRANCH_LINK_REQUIRED' })
  onboardingState?: string;

  @ApiPropertyOptional({ type: PosPortalWorkspacePricingDto })
  pricing?: PosPortalWorkspacePricingDto;

  @ApiPropertyOptional({ type: PosPortalActivationCandidateDto, isArray: true })
  activationCandidates?: PosPortalActivationCandidateDto[];

  @ApiPropertyOptional()
  activationAccessToken?: string;

  @ApiPropertyOptional()
  onboardingAccessToken?: string;

  @ApiProperty({ example: 'Forbidden' })
  error!: string;
}
