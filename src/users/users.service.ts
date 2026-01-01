import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  BadRequestException,
  UnauthorizedException,
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
    if (data.email) {
      const normalizedEmail = data.email.trim().toLowerCase();
      const existing = await this.userRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (existing) {
        throw new ConflictException('A user with this email already exists.');
      }
      data.email = normalizedEmail;
    }
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
   * Hard remove (anonymize) user by ID.
   * Instead of physical DELETE (blocked by FK constraints like reviews),
   * we scrub personal data, free the original email, and deactivate the account.
   */
  async remove(id: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    const tombstoneEmail = `deleted+${user.id}+${Date.now()}@deleted.local`;
    // Preserve minimal row for FK integrity (reviews/products) while scrubbing PII.
    user.email = tombstoneEmail;
    user.displayName = 'Deleted User';
    user.storeName = null as any;
    user.avatarUrl = null as any;
    user.vendorAvatarUrl = null as any;
    user.phoneCountryCode = null as any;
    user.phoneNumber = null as any;
    user.isPhoneVerified = false;
    user.businessLicenseInfo = null;
    user.verificationDocuments = [];
    user.verificationRejectionReason = null;
    user.verificationReviewedBy = null;
    user.verificationReviewedAt = null;
    user.googleId = null as any;
    user.bankAccountNumber = null as any;
    user.bankName = null as any;
    user.mobileMoneyNumber = null as any;
    user.mobileMoneyProvider = null as any;
    user.password = undefined; // remove hashed password so login impossible
    user.isActive = false;
    user.roles = [] as any; // no roles
    user.deletedAt = new Date();
    user.deletedBy = 'system';
    await this.userRepository.save(user);
    this.logger.log(`User anonymized instead of deleted id=${id}`);
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

    // Normalize search term and source
    const aliasSearch = (
      filters?.q ||
      filters?.query ||
      filters?.term ||
      filters?.keyword ||
      ''
    ).trim();
    const explicitSearch = (filters?.search || '').trim();
    const term = aliasSearch || explicitSearch;

    // ---- Advanced field-specific filters (added for admin tokens) ----
    // These allow precise server-side matches instead of client-side fallbacks.
    // Parsing precedence for active status tokens: status -> isActive -> active

    // Exact id match (token id:123)
    if (filters?.id) {
      qb.andWhere('user.id = :exactId', { exactId: filters.id });
    }

    // Email contains (token email:foo) - case-insensitive partial
    if (filters?.email) {
      qb.andWhere('user.email ILIKE :emailLike', {
        emailLike: `%${filters.email}%`,
      });
    }

    // Display name contains (token name:john)
    if (filters?.name) {
      qb.andWhere('user.displayName ILIKE :nameLike', {
        nameLike: `%${filters.name}%`,
      });
    }

    // Store name contains (token store:acme)
    if (filters?.store) {
      qb.andWhere('user.storeName ILIKE :storeLike', {
        storeLike: `%${filters.store}%`,
      });
    }

    // Map friendly status to isActive when provided
    let isActiveFilter: boolean | undefined = undefined;
    if (filters?.status === 'active') isActiveFilter = true;
    if (filters?.status === 'inactive') isActiveFilter = false;
    if (filters?.isActive !== undefined) {
      isActiveFilter = !!Number(filters.isActive);
    }
    if (filters?.active !== undefined && isActiveFilter === undefined) {
      // Only apply 'active' alias if status/isActive not already set
      isActiveFilter = !!Number(filters.active);
    }

    // Enforce role filter whenever provided so vendor/admin searches stay scoped
    if (filters?.role) {
      qb.andWhere('user.roles @> :roles', { roles: [filters.role] });
    }

    if (filters?.verificationStatus) {
      qb.andWhere('user.verificationStatus = :vs', {
        vs: filters.verificationStatus,
      });
    }

    if (typeof isActiveFilter === 'boolean') {
      qb.andWhere('user.isActive = :ia', { ia: isActiveFilter });
    }

    if (term) {
      if (aliasSearch) {
        // For q-based search: include storeName so vendor lookups work with q-term
        qb.andWhere(
          '(user.email ILIKE :t OR user.displayName ILIKE :t OR user.storeName ILIKE :t)',
          { t: `%${term}%` },
        );
      } else {
        // Legacy/explicit search: include storeName too for broader matching
        qb.andWhere(
          '(user.displayName ILIKE :t OR user.storeName ILIKE :t OR user.email ILIKE :t)',
          { t: `%${term}%` },
        );
      }
    }

    // Filter by presence of verification documents (hasdocs:true/false)
    if (filters?.hasdocs !== undefined) {
      const hasDocsToken = (filters.hasdocs || '').toLowerCase();
      const wantsDocs = ['true', '1'].includes(hasDocsToken);
      if (wantsDocs) {
        qb.andWhere(
          'jsonb_array_length(COALESCE(user.verificationDocuments, :emptyJsonb)) > 0',
          { emptyJsonb: '[]' },
        );
      } else if (['false', '0'].includes(hasDocsToken)) {
        qb.andWhere(
          'jsonb_array_length(COALESCE(user.verificationDocuments, :emptyJsonb)) = 0',
          { emptyJsonb: '[]' },
        );
      }
    }

    if (filters?.createdFrom) {
      qb.andWhere('user."createdAt" >= :from', { from: filters.createdFrom });
    }
    if (filters?.createdTo) {
      qb.andWhere('user."createdAt" <= :to', { to: filters.createdTo });
    }

    // Sorting
    const sortBy = filters?.sortBy || 'id';
    const sortOrder = (filters?.sortOrder || 'desc').toUpperCase() as
      | 'ASC'
      | 'DESC';
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
    const requested =
      filters?.limit && filters.limit > 0
        ? filters.limit
        : filters?.pageSize && filters.pageSize > 0
          ? filters.pageSize
          : 20;
    const pageSize = Math.min(requested, 1000); // allow up to 1000 for CSV batching
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
      throw new BadRequestException(
        'New password must be at least 8 characters long.',
      );
    }
    if (user.password) {
      if (!currentPassword) {
        throw new UnauthorizedException('Current password is required.');
      }
      const ok = await bcrypt.compare(currentPassword, user.password);
      if (!ok) {
        throw new UnauthorizedException('Current password is incorrect.');
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

  /** Create a user using Apple ID payload. Email may be missing for returning users. */
  async createWithApple(payload: {
    email: string;
    sub: string; // Apple user identifier
    name?: string;
    roles?: UserRole[];
  }): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { email: payload.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }
    const user = this.userRepository.create({
      email: payload.email,
      displayName: payload.name,
      appleId: payload.sub,
      roles:
        payload.roles && payload.roles.length > 0
          ? payload.roles
          : [UserRole.CUSTOMER],
      isActive: true,
    });
    return this.userRepository.save(user);
  }

  async findByAppleId(sub: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { appleId: sub } });
  }
}
