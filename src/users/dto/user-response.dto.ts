import { Expose, Exclude } from 'class-transformer';
import { UserRole } from '../../auth/roles.enum'; 

@Exclude()
export class UserResponseDto {
  @Expose()
  verificationStatus?: string;

  @Expose()
  verified?: boolean;
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

  // Explicitly exclude sensitive/internal fields:
  // @Exclude() password!: string;
  // @Exclude() isActive!: boolean;
  // @Exclude() createdAt!: Date;
  // @Exclude() updatedAt!: Date;
  // etc.
}