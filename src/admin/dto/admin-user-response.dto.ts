import { Exclude, Expose } from 'class-transformer';
import { UserRole } from '../../auth/roles.enum';
import { BranchStaffRole } from '../../branch-staff/entities/branch-staff-assignment.entity';
import { RetailModule } from '../../retail/entities/tenant-module-entitlement.entity';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from '../../retail/entities/tenant-subscription.entity';
import {
  BusinessLicenseInfo,
  VerificationDocument,
  VerificationStatus,
  VerificationMethod,
  CertificationStatus,
  resolveCertificationStatus,
} from '../../users/entities/user.entity';

@Exclude()
export class AdminPosBranchAssignmentDto {
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
export class AdminPosWorkspaceActivationCandidateDto {
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
export class AdminUserResponseDto {
  @Expose()
  id!: number;

  @Expose()
  email!: string;

  @Expose()
  roles!: UserRole[];

  @Expose()
  subscriptionTier?: string;

  @Expose()
  get certificationStatus(): CertificationStatus {
    return resolveCertificationStatus(this as any);
  }

  @Expose()
  get isCertified(): boolean {
    return this.certificationStatus === CertificationStatus.CERTIFIED;
  }

  @Expose()
  displayName?: string;

  @Expose()
  avatarUrl?: string;

  @Expose()
  storeName?: string;

  // --- Vendor Fields ---
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

  @Expose()
  telebirrAccount?: string;

  @Expose()
  interestedCategoryIds?: number[];

  @Expose()
  interestedCategoriesLastUpdated?: Date;

  @Expose()
  productCount?: number;

  @Expose()
  phoneCountryCode?: string;

  @Expose()
  phoneNumber?: string;

  @Expose()
  isPhoneVerified?: boolean;

  @Expose()
  isActive!: boolean;

  // Verification block
  @Expose()
  verificationStatus!: VerificationStatus;

  @Expose()
  verificationMethod!: VerificationMethod;

  @Expose()
  verificationDocuments?: VerificationDocument[] | null;

  @Expose()
  businessLicenseInfo?: BusinessLicenseInfo | null;

  @Expose()
  verificationRejectionReason?: string | null;

  @Expose()
  verificationReviewedBy?: string | null;

  @Expose()
  verificationReviewedAt?: Date | null;

  @Expose()
  verified!: boolean;

  @Expose()
  verifiedAt?: Date | null;

  @Expose()
  createdAt!: Date;

  @Expose()
  updatedAt!: Date;

  @Expose()
  posBranchAssignments?: AdminPosBranchAssignmentDto[];

  @Expose()
  posWorkspaceActivationCandidates?: AdminPosWorkspaceActivationCandidateDto[];
}
