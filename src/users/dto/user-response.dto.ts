import { Expose } from 'class-transformer';
import { UserRole } from '../user.entity';

export class UserResponseDto {
  @Expose()
  id!: number;

  @Expose()
  email!: string;

  @Expose()
  roles!: UserRole[]; // Directly expose the roles array from the entity

  @Expose()
  displayName?: string;

  @Expose()
  avatarUrl?: string;

  @Expose()
  storeName?: string; // Assuming User entity might have this, or it's added via transformation

  // password and isActive are excluded by default due to no @Expose()
  // If you want to be explicit:
  // @Exclude() password!: string;
  // @Exclude() isActive!: boolean;
}
