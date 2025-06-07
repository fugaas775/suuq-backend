import { Expose, Exclude } from 'class-transformer';
import { UserRole } from '../user.entity';

@Exclude()
export class UserResponseDto {
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

  // Explicitly exclude sensitive/internal fields:
  // @Exclude() password!: string;
  // @Exclude() isActive!: boolean;
  // @Exclude() createdAt!: Date;
  // @Exclude() updatedAt!: Date;
  // etc.
}