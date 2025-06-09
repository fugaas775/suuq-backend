import { Request } from 'express';
import { UserRole } from '../../auth/roles.enum'; // ✅ adjust if path differs

export interface AuthenticatedRequest extends Request {
  user: {
    id: number;
    email: string;
    roles: UserRole[]; // ✅ Strongly typed as enum values
  };
}
