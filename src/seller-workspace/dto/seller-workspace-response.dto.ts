import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../auth/roles.enum';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from '../../retail/entities/tenant-subscription.entity';
import { RetailModule } from '../../retail/entities/tenant-module-entitlement.entity';
import { PosUserFitCategory } from '../../categories/entities/category.entity';

export enum SellerPlanCode {
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  SCALE = 'SCALE',
}

export enum SellerWorkspaceBillingStatusDto {
  NOT_STARTED = 'NOT_STARTED',
  PLAN_SELECTED = 'PLAN_SELECTED',
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
}

export enum SellerWorkspaceStatusDto {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export class SellerWorkspaceUserSummaryDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserRole, isArray: true })
  roles!: UserRole[];

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  storeName!: string | null;
}

export class SellerWorkspaceStoreSummaryDto {
  @ApiProperty()
  vendorId!: number;

  @ApiProperty()
  storeName!: string;

  @ApiProperty({ isArray: true })
  permissions!: string[];

  @ApiPropertyOptional({ nullable: true })
  title!: string | null;

  @ApiProperty()
  joinedAt!: Date;
}

export class SellerWorkspaceBranchSummaryDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiPropertyOptional({ nullable: true })
  branchCode!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'CAFETERIA' })
  serviceFormat!: string | null;

  @ApiProperty()
  role!: string;

  @ApiProperty({ isArray: true })
  permissions!: string[];

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

  @ApiProperty()
  joinedAt!: Date;
}

export class SellerWorkspaceSubscriptionSummaryDto {
  @ApiProperty()
  tenantId!: number;

  @ApiProperty()
  tenantName!: string;

  @ApiProperty({ enum: TenantSubscriptionStatus })
  status!: TenantSubscriptionStatus;

  @ApiProperty()
  planCode!: string;

  @ApiProperty({ enum: TenantBillingInterval })
  billingInterval!: TenantBillingInterval;

  @ApiPropertyOptional({ nullable: true })
  amount!: number | null;

  @ApiPropertyOptional({ nullable: true })
  currency!: string | null;

  @ApiProperty()
  startsAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  endsAt!: Date | null;

  @ApiProperty()
  autoRenew!: boolean;
}

export class SellerWorkspaceRetailOnboardingProfileDto {
  @ApiPropertyOptional({ nullable: true })
  categoryId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  categorySlug!: string | null;

  @ApiPropertyOptional({ nullable: true })
  categoryName!: string | null;

  @ApiPropertyOptional({ enum: PosUserFitCategory, nullable: true })
  userFit!: PosUserFitCategory | null;

  @ApiPropertyOptional({ enum: PosUserFitCategory, nullable: true })
  suggestedUserFit!: PosUserFitCategory | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;
}

export class SellerWorkspaceRetailOwnerDto {
  @ApiPropertyOptional({ nullable: true })
  userId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'ACTIVE' })
  status!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastLoginAt!: string | null;
}

export class SellerWorkspaceRetailActivationReadinessDto {
  @ApiProperty()
  canActivate!: boolean;

  @ApiProperty({ example: 'READY' })
  status!: 'READY' | 'BLOCKED';

  @ApiProperty({ isArray: true })
  blockers!: string[];

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  managersAssignedCount!: number;

  @ApiProperty()
  operatorsAssignedCount!: number;

  @ApiProperty({ example: 'NOT_STARTED' })
  subscriptionState!: string;
}

export class SellerWorkspaceRetailContextDto {
  @ApiPropertyOptional({ nullable: true })
  tenantId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  tenantName!: string | null;

  @ApiPropertyOptional({
    type: SellerWorkspaceRetailOnboardingProfileDto,
    nullable: true,
  })
  onboardingProfile!: SellerWorkspaceRetailOnboardingProfileDto | null;

  @ApiPropertyOptional({
    type: SellerWorkspaceRetailOwnerDto,
    nullable: true,
  })
  owner!: SellerWorkspaceRetailOwnerDto | null;

  @ApiPropertyOptional({
    type: SellerWorkspaceRetailActivationReadinessDto,
    nullable: true,
  })
  activationReadiness!: SellerWorkspaceRetailActivationReadinessDto | null;
}

export class SellerWorkspacePricingDto {
  @ApiProperty({ example: 1900 })
  amount!: number;

  @ApiProperty({ example: 'ETB' })
  currency!: string;

  @ApiProperty({ enum: TenantBillingInterval })
  billingInterval!: TenantBillingInterval;

  @ApiProperty({ example: 'EBIRR' })
  paymentMethod!: string;
}

export class SellerWorkspaceBranchWorkspaceDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiPropertyOptional({ nullable: true })
  branchCode!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'CAFETERIA' })
  serviceFormat!: string | null;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  isOwner!: boolean;

  @ApiProperty()
  isTenantOwner!: boolean;

  @ApiPropertyOptional({ nullable: true })
  retailTenantId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  retailTenantName!: string | null;

  @ApiProperty({ example: 'ACTIVE' })
  workspaceStatus!: string;

  @ApiPropertyOptional({ enum: TenantSubscriptionStatus, nullable: true })
  subscriptionStatus!: TenantSubscriptionStatus | null;

  @ApiPropertyOptional({ nullable: true })
  planCode!: string | null;

  @ApiProperty()
  managerCount!: number;

  @ApiProperty()
  operatorCount!: number;

  @ApiProperty({ type: SellerWorkspaceRetailOwnerDto, isArray: true })
  assignedManagers!: SellerWorkspaceRetailOwnerDto[];

  @ApiProperty({ type: SellerWorkspaceRetailOwnerDto, isArray: true })
  assignedOperators!: SellerWorkspaceRetailOwnerDto[];

  @ApiPropertyOptional({ enum: PosUserFitCategory, nullable: true })
  tenantDefaultUserFit!: PosUserFitCategory | null;

  @ApiPropertyOptional({ enum: PosUserFitCategory, nullable: true })
  categoryOverrideUserFit!: PosUserFitCategory | null;

  @ApiProperty({ enum: RetailModule, isArray: true })
  modules!: RetailModule[];

  @ApiProperty({ type: SellerWorkspacePricingDto })
  pricing!: SellerWorkspacePricingDto;

  @ApiProperty()
  canStartActivation!: boolean;

  @ApiProperty()
  canStartTrial!: boolean;

  @ApiProperty()
  canOpenNow!: boolean;

  @ApiPropertyOptional({ nullable: true })
  trialStartedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  trialEndsAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  trialDaysRemaining!: number | null;

  @ApiProperty()
  joinedAt!: Date;
}

export class SellerWorkspaceBranchWorkspacesResponseDto {
  @ApiProperty({ type: SellerWorkspaceBranchWorkspaceDto, isArray: true })
  items!: SellerWorkspaceBranchWorkspaceDto[];
}

export class SellerWorkspaceChannelStatusDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  connected!: boolean;

  @ApiPropertyOptional({ nullable: true })
  detail!: string | null;
}

export class SellerWorkspaceOnboardingStepDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  completed!: boolean;

  @ApiPropertyOptional({ nullable: true })
  detail!: string | null;
}

export class SellerWorkspacePlanDefinitionDto {
  @ApiProperty({ enum: SellerPlanCode })
  code!: SellerPlanCode;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  fit!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ isArray: true })
  capabilities!: string[];

  @ApiProperty()
  recommended!: boolean;

  @ApiProperty()
  current!: boolean;
}

export class SellerWorkspaceStateResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  ownerUserId!: number;

  @ApiPropertyOptional({ nullable: true })
  primaryVendorId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  primaryRetailTenantId!: number | null;

  @ApiPropertyOptional({ enum: SellerPlanCode, nullable: true })
  selectedPlanCode!: SellerPlanCode | null;

  @ApiProperty({ enum: SellerWorkspaceBillingStatusDto })
  billingStatus!: SellerWorkspaceBillingStatusDto;

  @ApiProperty({ enum: SellerWorkspaceStatusDto })
  status!: SellerWorkspaceStatusDto;

  @ApiPropertyOptional({ nullable: true })
  planSelectedAt!: Date | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  onboardingState!: Record<string, any> | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  channelState!: Record<string, any> | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  metadata!: Record<string, any> | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class SellerWorkspaceProfileResponseDto {
  @ApiProperty({ type: SellerWorkspaceStateResponseDto })
  workspace!: SellerWorkspaceStateResponseDto;

  @ApiProperty({ type: SellerWorkspaceUserSummaryDto })
  user!: SellerWorkspaceUserSummaryDto;

  @ApiProperty({ type: SellerWorkspaceStoreSummaryDto, isArray: true })
  stores!: SellerWorkspaceStoreSummaryDto[];

  @ApiProperty({ type: SellerWorkspaceBranchSummaryDto, isArray: true })
  branches!: SellerWorkspaceBranchSummaryDto[];

  @ApiProperty({ type: SellerWorkspaceSubscriptionSummaryDto, isArray: true })
  subscriptions!: SellerWorkspaceSubscriptionSummaryDto[];

  @ApiProperty({ enum: SellerPlanCode })
  currentPlanCode!: SellerPlanCode;

  @ApiProperty({ enum: SellerPlanCode })
  recommendedPlanCode!: SellerPlanCode;

  @ApiProperty({ type: SellerWorkspaceChannelStatusDto, isArray: true })
  channels!: SellerWorkspaceChannelStatusDto[];

  @ApiProperty({ type: SellerWorkspaceOnboardingStepDto, isArray: true })
  onboarding!: SellerWorkspaceOnboardingStepDto[];

  @ApiPropertyOptional({
    type: SellerWorkspaceRetailContextDto,
    nullable: true,
  })
  primaryRetailContext!: SellerWorkspaceRetailContextDto | null;
}

export class SellerWorkspaceOverviewResponseDto {
  @ApiProperty({ type: SellerWorkspaceStateResponseDto })
  workspace!: SellerWorkspaceStateResponseDto;

  @ApiProperty()
  windowHours!: number;

  @ApiProperty()
  storeCount!: number;

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  orderCount!: number;

  @ApiProperty()
  grossSales!: number;

  @ApiProperty()
  purchaseOrderCount!: number;

  @ApiProperty()
  openPurchaseOrderCount!: number;

  @ApiProperty()
  checkoutCount!: number;

  @ApiProperty()
  failedCheckoutCount!: number;

  @ApiProperty()
  syncJobCount!: number;

  @ApiProperty()
  failedSyncJobCount!: number;

  @ApiProperty()
  catalogProductCount!: number;

  @ApiProperty()
  registerSessionCount!: number;

  @ApiProperty({ enum: SellerPlanCode })
  currentPlanCode!: SellerPlanCode;

  @ApiProperty({ enum: SellerPlanCode })
  recommendedPlanCode!: SellerPlanCode;

  @ApiProperty({ type: SellerWorkspaceChannelStatusDto, isArray: true })
  channels!: SellerWorkspaceChannelStatusDto[];
}

export class SellerWorkspacePlansResponseDto {
  @ApiProperty({ type: SellerWorkspaceStateResponseDto })
  workspace!: SellerWorkspaceStateResponseDto;

  @ApiProperty({ enum: SellerPlanCode })
  currentPlanCode!: SellerPlanCode;

  @ApiProperty({ enum: SellerPlanCode })
  recommendedPlanCode!: SellerPlanCode;

  @ApiProperty({ type: SellerWorkspacePlanDefinitionDto, isArray: true })
  plans!: SellerWorkspacePlanDefinitionDto[];

  @ApiProperty({ type: SellerWorkspaceSubscriptionSummaryDto, isArray: true })
  subscriptions!: SellerWorkspaceSubscriptionSummaryDto[];

  @ApiProperty({ type: SellerWorkspaceOnboardingStepDto, isArray: true })
  onboarding!: SellerWorkspaceOnboardingStepDto[];

  @ApiPropertyOptional({
    type: SellerWorkspaceRetailContextDto,
    nullable: true,
  })
  primaryRetailContext!: SellerWorkspaceRetailContextDto | null;
}

export class SellerWorkspaceAccessDeniedResponseDto {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: 'SELLER_WORKSPACE_ACCESS_DENIED' })
  code!: string;

  @ApiProperty({
    example: 'This account is not linked to any seller store or POS workspace.',
  })
  message!: string;

  @ApiProperty({ example: 'Forbidden' })
  error!: string;
}
