import { IsArray, IsEnum } from 'class-validator';
import { UserRole } from '../../auth/roles.enum';

export class UpdateUserRolesDto {
  @IsArray()
  @IsEnum(UserRole, { each: true })
  roles: UserRole[];
}
