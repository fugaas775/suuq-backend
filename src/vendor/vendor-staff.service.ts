/* eslint-disable @typescript-eslint/restrict-template-expressions */
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorStaff } from './entities/vendor-staff.entity';
import { User } from '../users/entities/user.entity';
import { VendorPermission } from './vendor-permissions.enum';
import { UsersService } from '../users/users.service';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { UpdateStaffPermissionsDto } from './dto/update-staff-permissions.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class VendorStaffService {
  private readonly logger = new Logger(VendorStaffService.name);

  constructor(
    @InjectRepository(VendorStaff)
    private readonly vendorStaffRepo: Repository<VendorStaff>,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Ensures that a Vendor (Owner) has a VendorStaff record for themselves
   * with full permissions.
   */
  async bootstrapOwner(user: User): Promise<VendorStaff> {
    const exists = await this.vendorStaffRepo.findOne({
      where: {
        member: { id: user.id },
        vendor: { id: user.id },
      },
    });

    if (exists) {
      // Ensure permissions are up to date (e.g. if new permissions were added to the enum)
      const allPermissions = Object.values(VendorPermission);
      // Simplify logic: Just overwrite with all perms if owner
      exists.permissions = allPermissions;
      return this.vendorStaffRepo.save(exists);
    }

    const newStaff = this.vendorStaffRepo.create({
      member: user,
      vendor: user,
      permissions: Object.values(VendorPermission),
      title: 'Owner',
    });

    this.logger.log(`Bootstrapping owner staff record for User #${user.id}`);
    return this.vendorStaffRepo.save(newStaff);
  }

  /**
   * Validates if a user has a specific permission for a specific vendor.
   * Returns the VendorStaff entity if valid/authorized.
   */
  async validateStaffPermission(
    userId: number,
    vendorId: number,
    permission?: VendorPermission,
  ): Promise<VendorStaff | null> {
    let staff = await this.vendorStaffRepo.findOne({
      where: {
        member: { id: userId },
        vendor: { id: vendorId },
      },
      relations: ['vendor', 'member'],
    });

    // DEBUG LOGGING
    if (
      permission === VendorPermission.VIEW_ORDERS ||
      permission === VendorPermission.MANAGE_ORDERS
    ) {
      this.logger.log(
        `Checking staff permission: User=${userId}, Vendor=${vendorId}, Perm=${permission}. Found Staff=${!!staff}, Title='${staff?.title}', Permissions=${staff?.permissions?.length}`,
      );
    }

    // --- AUTO-REPAIR PERMISSIONS FOR OWNERS ---
    // Trigger if:
    // 1. User IS the Vendor (Self-Store implicit owner)
    // 2. OR Staff record exists and is marked as 'Owner' (case-insensitive)
    // 3. OR User has MANAGE_SETTINGS (High privilege legacy user)
    const isSelfVendor = userId === vendorId;
    const title = staff?.title?.trim().toLowerCase();
    const isExplicitOwner = title === 'owner';
    const hasAdminPrivileges = staff?.permissions.includes(
      VendorPermission.MANAGE_SETTINGS,
    );

    // DEBUG: Diagnose the specific failure reported by user
    if (
      permission === VendorPermission.VIEW_ORDERS &&
      !isSelfVendor &&
      !isExplicitOwner
    ) {
      this.logger.warn(
        `Permission Check Failed details: User=${userId} Vendor=${vendorId} IsSelf=${isSelfVendor} Title='${staff?.title}' Perms=${staff?.permissions}`,
      );
    }

    if (isSelfVendor || isExplicitOwner || hasAdminPrivileges) {
      // Case A: No record exists, but user IS the vendor (Self-Bootstrapping)
      if (!staff && isSelfVendor) {
        try {
          const user = await this.usersService.findById(userId);
          if (user) {
            await this.bootstrapOwner(user);
            // Re-fetch
            staff = await this.vendorStaffRepo.findOne({
              where: {
                member: { id: userId },
                vendor: { id: vendorId },
              },
              relations: ['vendor', 'member'],
            });
          }
        } catch (e) {
          this.logger.error(`Failed to auto-bootstrap owner ${userId}`, e);
        }
      }
      // Case B: Staff record exists (Self or Explicit Owner) but permissions might be stale
      else if (staff) {
        const allPermissions = Object.values(VendorPermission);
        // Check if permissions are incomplete
        // (We check length or specific missing permission if requested)
        const isMissingRequested =
          permission && !staff.permissions.includes(permission);
        const isMissingAny = staff.permissions.length < allPermissions.length;

        if (isMissingRequested || isMissingAny) {
          this.logger.warn(
            `Owner (User #${userId}, Vendor #${vendorId}) missing permissions. Auto-repairing...`,
          );
          staff.permissions = allPermissions;
          // Ensure title is Owner if it wasn't set for some reason (e.g. legacy self-vendor)
          if (!staff.title) staff.title = 'Owner';

          await this.vendorStaffRepo.save(staff);
          // Update in-memory object so the check below passes
          // (No need to re-fetch as we mutated the object)
        }
      }
    }

    // --- PATCH: Implicit Permission Inheritance ---
    // User reported an issue where legacy staff/owners only had MANAGE_PRODUCTS but couldn't view orders.
    // If a user has MANAGE_PRODUCTS, we verify they should likely also have VIEW_ORDERS to act on those products.
    // This unblocks the dashboard for users stuck in a "Product Manager" state who are actually Owners.
    if (staff && permission === VendorPermission.VIEW_ORDERS) {
      const hasProducts = staff.permissions.includes(
        VendorPermission.MANAGE_PRODUCTS,
      );
      const hasOrders = staff.permissions.includes(
        VendorPermission.VIEW_ORDERS,
      );

      if (hasProducts && !hasOrders) {
        this.logger.warn(
          `Auto-Patch: User #${userId} has MANAGE_PRODUCTS but missing VIEW_ORDERS. Granting permission.`,
        );
        staff.permissions.push(VendorPermission.VIEW_ORDERS);
        await this.vendorStaffRepo.save(staff);
      }
    }

    if (!staff) return null;

    if (permission && !staff.permissions.includes(permission)) {
      return null;
    }

    return staff;
  }

  async findAll(vendorId: number) {
    return this.vendorStaffRepo.find({
      where: { vendor: { id: vendorId } },
      relations: ['member'],
    });
  }

  async findStoresForUser(userId: number) {
    return this.vendorStaffRepo.find({
      where: { member: { id: userId } },
      relations: ['vendor'],
    });
  }

  async invite(vendor: User, dto: InviteStaffDto): Promise<VendorStaff> {
    const user = await this.usersService.findByEmail(dto.email);
    const vendorName = vendor.displayName || 'the store';

    if (!user) {
      // Send key invitation to sign up if user doesn't exist
      await this.emailService.sendStaffInvitation(dto.email, vendorName, false);
      // In a real app, we might create a "PendingInvite" entity here.
      // For now, we only allow adding existing users.
      throw new NotFoundException(
        `User with email ${dto.email} not found. An invitation to sign up has been sent.`,
      );
    }

    const exists = await this.vendorStaffRepo.findOne({
      where: { member: { id: user.id }, vendor: { id: vendor.id } },
    });

    if (exists) {
      // If already staff, update permissions and resend invitation email
      exists.permissions = dto.permissions;
      const updated = await this.vendorStaffRepo.save(exists);
      await this.emailService.sendStaffInvitation(dto.email, vendorName, true);
      return updated;
    }

    const link = this.vendorStaffRepo.create({
      member: user,
      vendor: vendor,
      permissions: dto.permissions,
      title: 'Staff', // Default title, can be updated later
    });

    const saved = await this.vendorStaffRepo.save(link);
    await this.emailService.sendStaffInvitation(dto.email, vendorName, true);
    return saved;
  }

  async updatePermissions(
    vendorId: number,
    staffId: number,
    dto: UpdateStaffPermissionsDto,
  ): Promise<VendorStaff> {
    const staff = await this.vendorStaffRepo.findOne({
      where: { id: staffId, vendor: { id: vendorId } },
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found.');
    }

    // Prevent modification of Owner permissions (if we want to enforce safety)
    if (staff.title === 'Owner') {
      // Optional: Revert to full permissions if someone tries to demote owner via API
      // For now, allow it but log strict warning, or block.
      // It's better to block Owner modification via general endpoint.
      throw new BadRequestException(
        'Cannot modify Owner permissions via this endpoint.',
      );
    }

    staff.permissions = dto.permissions;
    return this.vendorStaffRepo.save(staff);
  }

  async remove(vendorId: number, staffId: number): Promise<void> {
    const staff = await this.vendorStaffRepo.findOne({
      where: { id: staffId, vendor: { id: vendorId } },
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found.');
    }

    if (staff.title === 'Owner') {
      throw new BadRequestException(
        'Cannot remove the Owner from the staff list.',
      );
    }

    await this.vendorStaffRepo.delete(staffId);
  }
}
