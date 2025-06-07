import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../auth/roles.enum'; // Adjust path if needed

export const ROLES_KEY = 'roles';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);