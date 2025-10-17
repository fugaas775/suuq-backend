import { Exclude, Expose } from 'class-transformer';
import { UserRole } from '../../auth/roles.enum';
import { BusinessLicenseInfo, VerificationDocument, VerificationStatus, VerificationMethod } from '../../users/entities/user.entity';

@Exclude()
export class AdminUserResponseDto {
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
}
