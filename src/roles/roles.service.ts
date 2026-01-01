import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RoleUpgradeRequest,
  RoleUpgradeStatus,
} from './entities/role-upgrade-request.entity';
import { UsersService } from '../users/users.service';
import { RequestRoleUpgradeDto } from './dto/request-upgrade.dto';
import { UserRole } from '../auth/roles.enum';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleUpgradeRequest)
    private readonly upgradeRepo: Repository<RoleUpgradeRequest>,
    private readonly usersService: UsersService,
  ) {}

  async requestUpgrade(userId: number, dto: RequestRoleUpgradeDto) {
    const user = await this.usersService.findById(userId);
    // Prevent duplicate pending requests for same user
    const existing = await this.upgradeRepo.findOne({
      where: { user: { id: userId }, status: RoleUpgradeStatus.PENDING },
    });
    if (existing) {
      return existing;
    }

    // Validate: ensure requested roles are subset of allowed upgradeable roles
    const allowed = new Set<UserRole>([UserRole.VENDOR, UserRole.DELIVERER]);
    const roles = (dto.roles || []).filter((r) => allowed.has(r));
    if (!roles.length) {
      throw new BadRequestException('At least one valid role is required');
    }

    const req = this.upgradeRepo.create({
      user,
      roles,
      country: dto.country,
      phoneCountryCode: dto.phoneCountryCode,
      phoneNumber: dto.phoneNumber,
      storeName: dto.storeName,
      businessLicenseNumber: dto.businessLicenseNumber,
      // documents: can be copied from user.verificationDocuments by admin view if needed
      status: RoleUpgradeStatus.PENDING,
    });
    return this.upgradeRepo.save(req);
  }

  async listRequests(status?: RoleUpgradeStatus) {
    const where = status ? { status } : {};
    return this.upgradeRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getLatestForUser(userId: number) {
    return this.upgradeRepo.findOne({
      where: { user: { id: userId } as any },
      order: { createdAt: 'DESC' },
    });
  }

  async approveRequest(requestId: number, actedBy: string) {
    const req = await this.upgradeRepo.findOne({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== RoleUpgradeStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }
    req.status = RoleUpgradeStatus.APPROVED;
    req.decidedBy = actedBy;
    await this.upgradeRepo.save(req);
    // Merge roles onto user (dedupe)
    const user = await this.usersService.findById(req.user.id);
    const newRoles = Array.from(new Set([...(user.roles || []), ...req.roles]));
    await this.usersService.updateUserRoles(user.id, newRoles);
    return req;
  }

  async rejectRequest(
    requestId: number,
    reason: string | undefined,
    actedBy: string,
  ) {
    const req = await this.upgradeRepo.findOne({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== RoleUpgradeStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }
    req.status = RoleUpgradeStatus.REJECTED;
    req.decisionReason = reason || null;
    req.decidedBy = actedBy;
    return this.upgradeRepo.save(req);
  }

  /**
   * Approve for a given userId and roles (alias for admin compatibility).
   * - If a pending request exists, approve it (merging roles if provided).
   * - Otherwise, create an APPROVED request record and update the user's roles.
   */
  async approveForUser(
    userId: number,
    roles: UserRole[] | undefined,
    actedBy: string,
  ) {
    const user = await this.usersService.findById(userId);
    const pending = await this.upgradeRepo.findOne({
      where: { user: { id: userId }, status: RoleUpgradeStatus.PENDING },
    });
    const allowed = new Set<UserRole>([UserRole.VENDOR, UserRole.DELIVERER]);
    const sanitized = (roles || []).filter((r) => allowed.has(r));

    if (pending) {
      // Merge requested roles onto existing request
      const mergedRoles = Array.from(
        new Set([...(pending.roles || []), ...sanitized]),
      );
      pending.roles = mergedRoles.length ? mergedRoles : pending.roles;
      pending.status = RoleUpgradeStatus.APPROVED;
      pending.decidedBy = actedBy;
      const saved = await this.upgradeRepo.save(pending);

      const newRoles = Array.from(
        new Set([...(user.roles || []), ...saved.roles]),
      );
      await this.usersService.updateUserRoles(user.id, newRoles);
      return saved;
    }

    // No pending request; create an approved record
    const request = this.upgradeRepo.create({
      user,
      roles: sanitized.length ? sanitized : [UserRole.VENDOR],
      status: RoleUpgradeStatus.APPROVED,
      decidedBy: actedBy,
    });
    const saved = await this.upgradeRepo.save(request);
    const newRoles = Array.from(
      new Set([...(user.roles || []), ...saved.roles]),
    );
    await this.usersService.updateUserRoles(user.id, newRoles);
    return saved;
  }

  /**
   * Reject for a given userId (alias for admin compatibility).
   * - If a pending request exists, mark as REJECTED with reason.
   * - Otherwise, create a REJECTED record for audit trail.
   */
  async rejectForUser(
    userId: number,
    reason: string | undefined,
    actedBy: string,
  ) {
    const user = await this.usersService.findById(userId);
    const pending = await this.upgradeRepo.findOne({
      where: { user: { id: userId }, status: RoleUpgradeStatus.PENDING },
    });
    if (pending) {
      pending.status = RoleUpgradeStatus.REJECTED;
      pending.decidedBy = actedBy;
      pending.decisionReason = reason || null;
      return this.upgradeRepo.save(pending);
    }
    const record = this.upgradeRepo.create({
      user,
      roles: [],
      status: RoleUpgradeStatus.REJECTED,
      decisionReason: reason || null,
      decidedBy: actedBy,
    });
    return this.upgradeRepo.save(record);
  }
}
