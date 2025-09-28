import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { User, VerificationStatus } from './entities/user.entity'; // Import VerificationStatus enum
import { UserRole } from '../auth/roles.enum';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Update a user's roles (replace the roles array).
   */
  async updateUserRoles(userId: number, newRoles: UserRole[]): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.roles = newRoles;
    return this.userRepository.save(user);
  }

  /**
   * Create a new user (local or otherwise), with password hashing.
   */
  async create(data: Partial<User>): Promise<User> {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    const user = this.userRepository.create(data);
    return this.userRepository.save(user);
  }

  /**
   * Find user by email, returning essential login fields.
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      // By removing the 'select' clause, TypeORM will fetch all fields
      // for the User entity, which is what we want.
    });
  }

  /**
   * Find user by ID (partial, nullable).
   */
  async findOne(id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  /**
   * Find user by ID, or throw if not found.
   */
  async findById(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * Remove user by ID.
   */
  async remove(id: number): Promise<void> {
    const result = await this.userRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
  }

  /**
   * Hard delete multiple users (irreversible). Returns count removed.
   */
  async hardDeleteMany(ids: number[]): Promise<{ deleted: number }> {
    if (!ids.length) return { deleted: 0 };
    const result = await this.userRepository.delete(ids);
    return { deleted: result.affected || 0 };
  }

  /**
   * Soft deactivate many users.
   */
  async deactivateMany(ids: number[]): Promise<{ updated: number }> {
    if (!ids.length) return { updated: 0 };
    const result = await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({ isActive: false })
      .whereInIds(ids)
      .execute();
    return { updated: result.affected || 0 };
  }

  /**
   * Find all users with optional filtering and pagination for admin panel.
   * Returns { users, total } for pagination.
   */
  async findAll(
    filters?: FindUsersQueryDto,
  ): Promise<{ users: User[]; total: number; page: number; pageSize: number }> {
    const qb = this.userRepository.createQueryBuilder('user');

    if (filters?.role) {
      qb.andWhere('user.roles @> :roles', { roles: [filters.role] });
    }

    if (filters?.verificationStatus) {
      qb.andWhere('user.verificationStatus = :vs', {
        vs: filters.verificationStatus,
      });
    }

    if (filters?.isActive !== undefined) {
      qb.andWhere('user.isActive = :ia', { ia: !!Number(filters.isActive) });
    }

    if (filters?.search) {
      qb.andWhere(
        '(user.displayName ILIKE :search OR user.storeName ILIKE :search OR user.email ILIKE :search)',
        {
          search: `%${filters.search}%`,
        },
      );
    }

    if (filters?.createdFrom) {
      qb.andWhere('user."createdAt" >= :from', { from: filters.createdFrom });
    }
    if (filters?.createdTo) {
      qb.andWhere('user."createdAt" <= :to', { to: filters.createdTo });
    }

    // Sorting
    const sortBy = filters?.sortBy || 'id';
    const sortOrder = (filters?.sortOrder || 'desc').toUpperCase() as 'ASC' | 'DESC';
    const sortableColumns = new Set([
      'id',
      'email',
      'displayName',
      'createdAt',
      'verificationStatus',
    ]);
    if (sortableColumns.has(sortBy)) {
      qb.orderBy(`user.${sortBy}`, sortOrder);
    } else {
      qb.orderBy('user.id', 'DESC');
    }

    // Pagination (safe bounds)
    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const rawPageSize = filters?.pageSize && filters.pageSize > 0 ? filters.pageSize : 20;
    const pageSize = Math.min(rawPageSize, 200); // cap to avoid huge queries
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [users, total] = await qb.getManyAndCount();
    return { users, total, page, pageSize };
  }

  /**
   * Count all users in the database.
   */
  async countAll(): Promise<number> {
    return this.userRepository.count();
  }

  /**
   * Count users by role (checks if roles array contains the given role).
   */
  async countByRole(role: UserRole): Promise<number> {
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.roles @> :roles', { roles: [role] })
      .getCount();
  }

  /**
   * Update user by ID.
   * If password is present, hash it before updating.
   */
  async update(id: number, data: Partial<User>): Promise<User> {
    // Only allow safe fields to be updated by admin
    const allowedFields: (keyof User)[] = [
      'displayName',
      'avatarUrl',
      'storeName',
      'phoneCountryCode',
      'phoneNumber',
  'isPhoneVerified',
      'isActive',
      // Verification fields for admin
      'verificationStatus',
      'verificationDocuments',
      'verified',
  'verifiedAt',
    ];
    const updateData: Partial<User> = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        (updateData as any)[key] = data[key];
      }
    }
    // If admin sets verificationStatus to APPROVED, set verified to true
    if (data.verificationStatus === VerificationStatus.APPROVED) {
      updateData.verified = true;
    }
    const result = await this.userRepository.update(id, updateData);
    if (result.affected === 0) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return this.findById(id);
  }

  /**
   * Normalize verificationDocuments into a standard array of { url, name }.
   * Handles legacy stringified JSON and null/undefined.
   */
  normalizeVerificationDocuments(input: any): { url: string; name: string }[] {
    if (!input) return [];
    let docs: any = input;
    if (typeof input === 'string') {
      try {
        docs = JSON.parse(input);
      } catch (e) {
        this.logger.warn(`Failed to parse verificationDocuments string: ${e}`);
        return [];
      }
    }
    if (!Array.isArray(docs)) return [];
    return docs
      .filter((d) => d && (d.url || (d.src && typeof d.src === 'string'))) // tolerate {src}
      .map((d) => ({
        url: d.url || d.src,
        name: d.name || d.filename || 'document',
      }));
  }

  /**
   * Public certificates for a vendor. Returns [] unless APPROVED.
   */
  async getPublicCertificates(
    userId: number,
  ): Promise<{ url: string; name: string }[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return [];
    if (user.verificationStatus !== VerificationStatus.APPROVED) return [];
    return this.normalizeVerificationDocuments(user.verificationDocuments);
  }

  /**
   * Admin action: set verification status (APPROVED/REJECTED) and log audit event.
   * Does not modify verificationDocuments.
   */
  async setVerificationStatus(
    userId: number,
    status: VerificationStatus.APPROVED | VerificationStatus.REJECTED,
    actedBy?: string,
    reason?: string,
  ): Promise<User> {
    const user = await this.findById(userId);
    const prevStatus = user.verificationStatus;
    user.verificationStatus = status;
    if (status === VerificationStatus.APPROVED) {
      user.verified = true;
      user.verifiedAt = user.verifiedAt || new Date();
      // Clear rejection metadata if previously rejected
      user.verificationRejectionReason = null;
    } else if (status === VerificationStatus.REJECTED) {
      user.verified = false; // ensure false
      user.verificationRejectionReason = reason || null;
    }
    user.verificationReviewedBy = actedBy || null;
    user.verificationReviewedAt = new Date();
    user.updatedBy = actedBy;
    const saved = await this.userRepository.save(user);
    this.logger.log(
      `Verification status changed: userId=${userId} prev=${prevStatus} status=${status} reason=${reason || 'n/a'} by=${actedBy || 'system'}`,
    );
    return saved;
  }

  /**
   * Deactivate a user.
   */
  async deactivate(id: number): Promise<User> {
    await this.userRepository.update(id, { isActive: false });
    return this.findById(id);
  }

  /**
   * Deactivate a user (alias for admin controller).
   */
  async deactivateUser(id: number): Promise<User> {
    return this.deactivate(id);
  }

  /**
   * Reactivate a user.
   */
  async reactivate(id: number): Promise<User> {
    await this.userRepository.update(id, { isActive: true });
    return this.findById(id);
  }

  /**
   * Change the password for the given user.
   * - If a current password exists, verify it before changing.
   * - If no current password (e.g., social login), allow setting a new one directly.
   */
  async changePassword(
    userId: number,
    currentPassword: string | undefined,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!newPassword || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }
    if (user.password) {
      const ok = await bcrypt.compare(currentPassword || '', user.password);
      if (!ok) {
        throw new Error('Current password is incorrect.');
      }
    }
    const hash = await bcrypt.hash(newPassword, 10);
    user.password = hash;
    await this.userRepository.save(user);
  }

  /**
   * Get current user by ID.
   */
  async getMe(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByResetToken(token: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: {
        passwordResetToken: token,
        passwordResetExpires: MoreThan(new Date()), // Check that the token is not expired
      },
    });
  }

  /**
   * Create a user using Google profile payload.
   * Prevents duplicate emails, sets defaults, and omits password.
   */
  async createWithGoogle(payload: {
    email: string;
    name?: string;
    picture?: string;
    sub: string;
    given_name?: string;
    family_name?: string;
    roles?: UserRole[];
  }): Promise<User> {
    // Prevent duplicate emails
    const existing = await this.userRepository.findOne({
      where: { email: payload.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }
    const user = this.userRepository.create({
      email: payload.email,
      displayName:
        payload.name ||
        `${payload.given_name || ''} ${payload.family_name || ''}`.trim(),
      avatarUrl: payload.picture,
      googleId: payload.sub,
      roles:
        payload.roles && payload.roles.length > 0
          ? payload.roles
          : [UserRole.CUSTOMER],
      // password is omitted rather than set to null
      isActive: true,
    });
    return this.userRepository.save(user);
  }
}
