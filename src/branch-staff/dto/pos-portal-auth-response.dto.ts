import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../auth/roles.enum';
import {
  BranchStaffCapability,
  BranchStaffRole,
} from '../entities/branch-staff-assignment.entity';
import { RetailModule } from '../../retail/entities/tenant-module-entitlement.entity';
import { BranchHomeConfig } from '../../branches/entities/branch-home-config.type';
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

  @ApiPropertyOptional({
    nullable: true,
    example: '11:00',
    description:
      'HOTEL standard checkout time "HH:MM" 24h. Seeds the folio default time ' +
      'and the early/late fee boundary on the register. Null = 11:00 default.',
  })
  checkoutPolicyTime!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Brand logo URL for this branch, shown in the register badge and on receipts.',
  })
  logoUrl!: string | null;

  @ApiPropertyOptional({
    description:
      'Whether this branch charges tax (VAT) on sales. Drives the register ' +
      'cart math and the VAT row on receipts. Applies to all service formats.',
  })
  taxEnabled!: boolean;

  @ApiPropertyOptional({
    description:
      'Tax (VAT) rate as a FRACTION — 0.15 is 15%. Ignored while taxEnabled ' +
      'is false. Tax is exclusive: added on top of the discounted subtotal.',
    example: 0.15,
  })
  taxRate!: number;

  @ApiPropertyOptional({
    description:
      'Whether catalog prices already contain the tax. false = exclusive (tax ' +
      'added at checkout); true = inclusive (extracted out of the shelf price).',
  })
  taxInclusive!: boolean;

  @ApiPropertyOptional({
    description:
      'What this branch calls its tax on a receipt — VAT, TOT, Sales Tax. ' +
      'Null means VAT.',
    nullable: true,
  })
  taxName!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Per-branch layout for the customizable Home page (widgets, order, ' +
      'quick-links, welcome note, branding). Null = per-format default.',
  })
  homeConfig!: BranchHomeConfig | null;
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
  @ApiProperty({ enum: ['MONTHLY', 'ONE_YEAR'], example: 'MONTHLY' })
  period!: 'MONTHLY' | 'ONE_YEAR';

  @ApiProperty({ example: 1 })
  months!: number;

  @ApiProperty({ example: 3900 })
  amount!: number;

  @ApiProperty({ example: 'ETB' })
  currency!: string;

  @ApiProperty({ example: '6 months' })
  label!: string;

  @ApiProperty({ example: 'POS_BRANCH_1M' })
  planCode!: string;
}

export class PosPortalWorkspacePricingDto {
  @ApiProperty({ example: 3900 })
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
