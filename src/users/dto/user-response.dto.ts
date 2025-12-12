import { Expose, Exclude } from 'class-transformer';
import { UserRole } from '../../auth/roles.enum';

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
  displayName?: string;

  @Expose()
  avatarUrl?: string;

  @Expose()
  storeName?: string;

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
  createdAt?: Date; // helpful for sorting / UI display

  // Explicitly exclude sensitive/internal fields:
  // @Exclude() password!: string;
  // @Exclude() isActive!: boolean;
  // @Exclude() createdAt!: Date;
  // @Exclude() updatedAt!: Date;
  // etc.
}
