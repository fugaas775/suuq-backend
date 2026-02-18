import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '../../users/entities/user.entity';

/**
 * extracts the active vendor context from the request.
 * Header: `x-vendor-id`
 *
 * Logic:
 * 1. If header is present, it returns that Vendor (User Entity) *if* the logged-in user is a staff member.
 *    (The Guard usually ensures permissions, this decorator just extracts).
 * 2. If header is missing:
 *    - If User is a VENDOR, returns User (implicit self-context).
 *    - Defaults to first employment? No, explicit is better.
 *      If missing and User is basic user, return null or throw.
 */
export const ActiveVendor = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    // This value is populated by VendorPermissionGuard usually,
    // or we can just read the header directly if unconditional.
    // Ideally, the Guard should attach the 'activeVendor' entity to the request object
    // to avoid double DB calls.

    if (request.activeVendor) {
      return request.activeVendor as User;
    }

    // Fallback if guard wasn't used but decorator is called (unlikely but safe)
    // For now, return activeVendor if present, else throw or return null.

    // If undefined, it means the endpoint might not be guarded properly
    // or the user didn't send the header and logic fell back.
    throw new UnauthorizedException('Active Vendor context is missing');
  },
);
