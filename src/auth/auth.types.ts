import { Request } from 'express';

// Roles your system supports
export type AppRole = 'CUSTOMER' | 'VENDOR' | 'ADMIN' | 'DELIVERER' | 'SUPER_ADMIN';

// What is stored in the JWT token (decoded from access_token)
export interface JwtPayload {
  sub: number; // user ID
  email: string;
  role: AppRole | AppRole[];
  iat?: number;
  exp?: number;
}

// What is injected into req.user by Passport after JWT validation
export interface AppUser {
  id: number;
  email: string;
  roles: AppRole[];
  displayName?: string;
  avatarUrl?: string;
  storeName?: string;
  lastLoginMethod?: 'email' | 'google';
}

// Extend Express.Request for typed req.user
export interface AuthenticatedRequest extends Request {
  user?: AppUser;
}
