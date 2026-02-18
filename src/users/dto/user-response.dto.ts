import { Expose, Exclude } from 'class-transformer';
import { UserRole } from '../../auth/roles.enum';
import { VendorStaff } from '../../vendor/entities/vendor-staff.entity';
import {
  CertificationStatus,
  SubscriptionTier,
  resolveCertificationStatus,
} from '../entities/user.entity';

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

  // Explicitly exclude sensitive/internal fields:
  // @Exclude() password!: string;
  // @Exclude() isActive!: boolean;
  // @Exclude() createdAt!: Date;
  // @Exclude() updatedAt!: Date;
  // etc.
}
