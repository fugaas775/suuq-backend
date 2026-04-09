import { Expose, Exclude } from 'class-transformer';
import { UserRole } from '../../auth/roles.enum';
import { VendorStaff } from '../../vendor/entities/vendor-staff.entity';
import { BranchStaffRole } from '../../branch-staff/entities/branch-staff-assignment.entity';
import { RetailModule } from '../../retail/entities/tenant-module-entitlement.entity';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from '../../retail/entities/tenant-subscription.entity';
import {
  CertificationStatus,
  SubscriptionTier,
  resolveCertificationStatus,
} from '../entities/user.entity';
import {
  SellerPlanCode,
  SellerWorkspaceBillingStatusDto,
} from '../../seller-workspace/dto/seller-workspace-response.dto';

@Exclude()
export class UserPosBranchAssignmentDto {
  @Expose()
  branchId!: number;

  @Expose()
  branchName!: string;

  @Expose()
  branchCode!: string | null;

  @Expose()
  role!: BranchStaffRole;

  @Expose()
  permissions!: string[];

  @Expose()
  isOwner!: boolean;

  @Expose()
  retailTenantId!: number | null;

  @Expose()
  retailTenantName!: string | null;

  @Expose()
  modules!: RetailModule[];

  @Expose()
  joinedAt!: Date;
}

@Exclude()
export class UserPosWorkspaceActivationCandidateDto {
  @Expose()
  branchId!: number;

  @Expose()
  branchName!: string;

  @Expose()
  branchCode!: string | null;

  @Expose()
  role!: BranchStaffRole;

  @Expose()
  isOwner!: boolean;

  @Expose()
  retailTenantId!: number | null;

  @Expose()
  retailTenantName!: string | null;

  @Expose()
  workspaceStatus!:
    | 'TENANT_SETUP_REQUIRED'
    | 'TENANT_INACTIVE'
    | 'MODULE_SETUP_REQUIRED'
    | 'PAYMENT_REQUIRED'
    | 'TRIAL'
    | 'PAST_DUE'
    | 'EXPIRED'
    | 'CANCELLED';

  @Expose()
  subscriptionStatus!: TenantSubscriptionStatus | null;

  @Expose()
  planCode!: string | null;

  @Expose()
  pricing!: {
    amount: number;
    currency: string;
    billingInterval: TenantBillingInterval;
    paymentMethod: string;
  };
}

@Exclude()
export class UserSellerWorkspaceSummaryDto {
  @Expose()
  windowHours!: number;

  @Expose()
  storeCount!: number;

  @Expose()
  branchCount!: number;

  @Expose()
  orderCount!: number;

  @Expose()
  grossSales!: number;

  @Expose()
  purchaseOrderCount!: number;

  @Expose()
  openPurchaseOrderCount!: number;

  @Expose()
  checkoutCount!: number;

  @Expose()
  failedCheckoutCount!: number;

  @Expose()
  syncJobCount!: number;

  @Expose()
  failedSyncJobCount!: number;

  @Expose()
  catalogProductCount!: number;

  @Expose()
  registerSessionCount!: number;

  @Expose()
  currentPlanCode!: SellerPlanCode;

  @Expose()
  recommendedPlanCode!: SellerPlanCode;

  @Expose()
  billingStatus!: SellerWorkspaceBillingStatusDto;

  @Expose()
  status!: string;
}

@Exclude()
export class UserResponseDto {
  @Expose()
  verificationStatus?: string;

  // Helpful alias for UI chips: APPROVED => VERIFIED
  @Expose()
  get verificationStatusDisplay(): string | undefined {
    if (!this.verificationStatus) return undefined;
    return this.verificationStatus === 'APPROVED'
      ? 'VERIFIED'
      : this.verificationStatus;
  }

  @Expose()
  verified?: boolean;

  @Expose()
  verificationRejectionReason?: string | null;

  @Expose()
  verificationReviewedBy?: string | null;

  @Expose()
  verificationReviewedAt?: Date | null;
  @Expose()
  id!: number;

  @Expose()
  email!: string;

  @Expose()
  roles!: UserRole[];

  @Expose()
  employments?: VendorStaff[];

  @Expose()
  subscriptionTier?: SubscriptionTier;

  @Expose()
  get certificationStatus(): CertificationStatus {
    return resolveCertificationStatus(this as any);
  }

  @Expose()
  get isCertified(): boolean {
    return this.certificationStatus === CertificationStatus.CERTIFIED;
  }

  @Expose()
  businessModel?: string;

  @Expose()
  commissionRate?: number;

  @Expose()
  subscriptionExpiry?: Date | null;

  @Expose()
  displayName?: string;

  @Expose()
  avatarUrl?: string;

  @Expose()
  storeName?: string;

  @Expose()
  legalName?: string;

  @Expose()
  businessLicenseNumber?: string;

  @Expose()
  taxId?: string;

  @Expose()
  registrationCountry?: string;

  @Expose()
  registrationRegion?: string;

  @Expose()
  registrationCity?: string;

  @Expose()
  businessType?: string;

  @Expose()
  contactName?: string;

  @Expose()
  vendorPhoneNumber?: string;

  @Expose()
  vendorEmail?: string;

  @Expose()
  website?: string;

  @Expose()
  address?: string;

  @Expose()
  postalCode?: string;

  @Expose()
  vendorAvatarUrl?: string;

  // Friendly fallback name for vendor/autocomplete display
  @Expose()
  get vendorName(): string | undefined {
    return (
      this.displayName ||
      this.storeName ||
      (this as any).legalName ||
      (this as any).contactName ||
      undefined
    );
  }

  // Generic name alias some clients use
  @Expose()
  get name(): string | undefined {
    return this.vendorName;
  }

  @Expose()
  phoneCountryCode?: string;

  @Expose()
  phoneNumber?: string;

  @Expose()
  isPhoneVerified?: boolean;

  @Expose()
  telebirrAccount?: string;

  @Expose()
  telebirrVerified?: boolean;

  @Expose()
  telebirrVerifiedAt?: Date | null;

  @Expose()
  createdAt?: Date; // helpful for sorting / UI display

  @Expose()
  posBranchAssignments?: UserPosBranchAssignmentDto[];

  @Expose()
  posWorkspaceActivationCandidates?: UserPosWorkspaceActivationCandidateDto[];

  @Expose()
  sellerWorkspaceSummary?: UserSellerWorkspaceSummaryDto | null;

  // Explicitly exclude sensitive/internal fields:
  // @Exclude() password!: string;
  // @Exclude() isActive!: boolean;
  // @Exclude() createdAt!: Date;
  // @Exclude() updatedAt!: Date;
  // etc.
}
