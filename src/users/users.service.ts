/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  BadRequestException,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';
import {
  User,
  VerificationStatus,
  SubscriptionTier,
  BusinessModel,
  VerificationMethod,
  isCertifiedVendor,
} from './entities/user.entity'; // Import VerificationStatus enum
import { RequestVerificationDto } from './dto/request-verification.dto';
import {
  SubscriptionRequest,
  SubscriptionRequestStatus,
} from './entities/subscription-request.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { WalletService } from '../wallet/wallet.service';
import { TransactionType } from '../wallet/entities/wallet-transaction.entity';
import { CurrencyService } from '../common/services/currency.service';
import { UserRole } from '../auth/roles.enum';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import * as bcrypt from 'bcrypt';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SubscriptionRequest)
    private readonly subscriptionRequestRepository: Repository<SubscriptionRequest>,
    @InjectRepository(UiSetting)
    private readonly uiSettingRepo: Repository<UiSetting>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
    private readonly currencyService: CurrencyService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Upgrade current user to VENDOR role (Unverified).
   */
  async upgradeToVendor(userId: number): Promise<User> {
    const user = await this.findById(userId);
    let changed = false;

    if (!user.roles.includes(UserRole.VENDOR)) {
      user.roles.push(UserRole.VENDOR);
      changed = true;
    }

    if (user.roles.includes(UserRole.CUSTOMER)) {
      user.roles = user.roles.filter((role) => role !== UserRole.CUSTOMER);
      changed = true;
    }

    if (changed) {
      // Ensure verification status is UNVERIFIED initially if not set
      if (!user.verificationStatus) {
        user.verificationStatus = VerificationStatus.UNVERIFIED;
      }
      return this.userRepository.save(user);
    }

    return user;
  }

  /**
   * Request verification (Licensed Vendor) by uploading documents.
   */
  async requestVerification(
    userId: number,
    dto: RequestVerificationDto,
  ): Promise<User> {
    const user = await this.findById(userId);

    // Update verification documents
    user.verificationDocuments = dto.documents;

    if (dto.businessLicenseInfo) {
      user.businessLicenseInfo = dto.businessLicenseInfo as any;
    }

    user.verificationStatus = VerificationStatus.PENDING;
    user.verificationMethod = VerificationMethod.MANUAL;

    const savedUser = await this.userRepository.save(user);

    // Notify Admin
    try {
      const adminEmail = 'admin@suuqsapp.com';
      const userIdentifier =
        savedUser.email || savedUser.phoneNumber || `ID: ${savedUser.id}`;
      await this.emailService.send({
        to: adminEmail,
        subject: 'New Business Verification Request',
        text: `User ${userIdentifier} has submitted a business license for verification. Please review it in the admin dashboard.`,
        html: `<p>User <strong>${userIdentifier} (ID: ${savedUser.id})</strong> has submitted a business license for verification.</p>
               <p>Please review their documents in the admin dashboard.</p>`,
      });
    } catch (err) {
      this.logger.error(
        `Failed to notify admin of verification request for user ${userId}: ${err}`,
      );
    }

    return savedUser;
  }

  /**
   * Update a user's roles (replace the roles array).
   */
  async updateUserRoles(userId: number, newRoles: UserRole[]): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Enforce logic: If VENDOR is present, remove CUSTOMER
    if (newRoles.includes(UserRole.VENDOR)) {
      newRoles = newRoles.filter((role) => role !== UserRole.CUSTOMER);
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
  async findByEmail(
    email: string,
    relations: string[] = [],
  ): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations,
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
  async findById(id: number, relations: string[] = []): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations,
    });
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
    const qb = this.userRepository.createQueryBuilder('u');

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
      qb.andWhere('u.id = :exactId', { exactId: filters.id });
    }

    // Email contains (token email:foo) - case-insensitive partial
    if (filters?.email) {
      qb.andWhere('u.email ILIKE :emailLike', {
        emailLike: `%${filters.email}%`,
      });
    }

    // Display name contains (token name:john)
    if (filters?.name) {
      qb.andWhere('u.displayName ILIKE :nameLike', {
        nameLike: `%${filters.name}%`,
      });
    }

    // Store name contains (token store:acme)
    if (filters?.store) {
      qb.andWhere('u.storeName ILIKE :storeLike', {
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
      qb.andWhere('u.roles @> :roles', { roles: [filters.role] });
    }

    if (filters?.verificationStatus) {
      qb.andWhere('u.verificationStatus = :vs', {
        vs: filters.verificationStatus,
      });
    }

    if (typeof isActiveFilter === 'boolean') {
      qb.andWhere('u.isActive = :ia', { ia: isActiveFilter });
    }

    if (term) {
      if (aliasSearch) {
        // For q-based search: include storeName so vendor lookups work with q-term
        qb.andWhere(
          '(u.email ILIKE :t OR u.displayName ILIKE :t OR u.storeName ILIKE :t)',
          { t: `%${term}%` },
        );
      } else {
        // Legacy/explicit search: include storeName too for broader matching
        qb.andWhere(
          '(u.displayName ILIKE :t OR u.storeName ILIKE :t OR u.email ILIKE :t)',
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
          'jsonb_array_length(COALESCE(u.verificationDocuments, :emptyJsonb)) > 0',
          { emptyJsonb: '[]' },
        );
      } else if (['false', '0'].includes(hasDocsToken)) {
        qb.andWhere(
          'jsonb_array_length(COALESCE(u.verificationDocuments, :emptyJsonb)) = 0',
          { emptyJsonb: '[]' },
        );
      }
    }

    if (filters?.createdFrom) {
      qb.andWhere('u."createdAt" >= :from', { from: filters.createdFrom });
    }
    if (filters?.createdTo) {
      qb.andWhere('u."createdAt" <= :to', { to: filters.createdTo });
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
      qb.orderBy(`u.${sortBy}`, sortOrder);
    } else {
      qb.orderBy('u.id', 'DESC');
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
   * Find users by role for notifications (unlimited).
   */
  async findRecipientsByRole(role: UserRole): Promise<User[]> {
    return this.userRepository
      .createQueryBuilder('u')
      .where('u.roles @> :role', { role: [role] })
      .andWhere('u.isActive = :isActive', { isActive: true }) // Only active users
      .select(['u.id', 'u.email']) // specific fields
      .getMany();
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
      .createQueryBuilder('u')
      .where('u.roles::text[] @> :roles::text[]', { roles: [role] })
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
      'language', // Allow language updates
      'storeName',
      'phoneCountryCode',
      'phoneNumber',
      'isPhoneVerified',
      'isActive',
      // Vendor / Contact Fields
      'legalName',
      'businessLicenseNumber',
      'taxId',
      'registrationCountry',
      'registrationRegion',
      'registrationCity',
      'businessType',
      'contactName',
      'vendorPhoneNumber',
      'vendorEmail',
      'website',
      'address',
      'postalCode',
      'vendorAvatarUrl',
      'telebirrAccount', // Added
      // Verification fields for admin
      'verificationStatus',
      'verificationDocuments',
      'verified',
      'verifiedAt',
      'interestedCategoryIds',
      'interestedCategoriesLastUpdated',
    ];

    // Custom Logic for Interest Updates
    if (data.interestedCategoryIds !== undefined) {
      if (!Array.isArray(data.interestedCategoryIds)) {
        throw new BadRequestException('interestedCategoryIds must be an array');
      }
      if (data.interestedCategoryIds.length > 3) {
        throw new BadRequestException(
          'You can select a maximum of 3 top-level categories.',
        );
      }

      // We need the full user object to check subscription and last update time
      const user = await this.findById(id);

      if (!isCertifiedVendor(user)) {
        throw new BadRequestException(
          'Customizing interest categories is available for Certified vendors. Please verify your business to continue.',
        );
      }

      // Check frequency (3 months = approx 90 days)
      if (user.interestedCategoriesLastUpdated) {
        const now = new Date();
        const lastUpdate = new Date(user.interestedCategoriesLastUpdated);
        const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const COOLDOWN_DAYS = 90;

        // If trying to CHANGE the categories (allow re-submitting same list effectively, but better to just strict block update)
        // Checking strictly if it's a cooldown period.
        if (diffDays < COOLDOWN_DAYS) {
          throw new BadRequestException(
            `You can only update your interest categories once every 3 months. Next update available in ${COOLDOWN_DAYS - diffDays} days.`,
          );
        }
      }

      // If validation passes, update timestamp
      data.interestedCategoriesLastUpdated = new Date();
    }

    // Check for phone number uniqueness to prevent duplicate verified accounts
    if (data.phoneNumber) {
      // Normalize: simple valid E.164 check if country/region known, or just raw format
      if (data.phoneCountryCode) {
        // Example: +251 + 911223344
        const combined =
          (data.phoneCountryCode.startsWith('+') ? '' : '+') +
          data.phoneCountryCode +
          data.phoneNumber;
        const parsed = parsePhoneNumberFromString(combined);
        if (parsed && parsed.isValid()) {
          // Standardize to national format or remove leading zeros to match potential verify service normalization
          // But here we just keep it simple or store clean inputs
          data.phoneNumber = parsed.nationalNumber; // Strip country code part from phone number field
        }
      }

      const qb = this.userRepository
        .createQueryBuilder('u')
        .where('u.phoneNumber = :phoneNumber', {
          phoneNumber: data.phoneNumber,
        })
        .andWhere('u.id != :id', { id });

      if (data.phoneCountryCode) {
        qb.andWhere('u.phoneCountryCode = :phoneCountryCode', {
          phoneCountryCode: data.phoneCountryCode,
        });
      }

      const count = await qb.getCount();
      if (count > 0) {
        throw new ConflictException(
          'This phone number is already linked to another account.',
        );
      }
    }

    const updateData: Partial<User> = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        (updateData as any)[key] = data[key];
      }
    }

    // Reset Telebirr verification if account changes
    if (
      data.telebirrAccount &&
      data.telebirrAccount !== (await this.findById(id)).telebirrAccount
    ) {
      updateData.telebirrVerified = false;
      updateData.telebirrVerifiedAt = null;
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
   * Directly update email (system use only, e.g. after verification).
   * Bypasses allowedFields filter.
   */
  async updateEmail(id: number, email: string): Promise<User> {
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing && existing.id !== id) {
      throw new ConflictException('Email already in use');
    }

    await this.userRepository.update(id, { email });
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
      // Clear rejection metadata if previously rejected
      user.verificationRejectionReason = null;
    } else if (status === VerificationStatus.REJECTED) {
      user.verificationRejectionReason = reason || null;
    }
    this.updateVerifiedFlag(user);
    user.verificationReviewedBy = actedBy || null;
    user.verificationReviewedAt = new Date();
    user.updatedBy = actedBy;
    const saved = await this.userRepository.save(user);
    this.logger.log(
      `Verification status changed: userId=${userId} prev=${prevStatus} status=${status} reason=${reason || 'n/a'} by=${actedBy || 'system'}`,
    );

    // Send notifications if status changed
    if (prevStatus !== status) {
      try {
        if (status === VerificationStatus.APPROVED) {
          const subject = 'Your Business Verification has been Approved!';
          const body =
            'Congratulations! Your business verification for Suuq has been approved. You now have full access to vendor features.';

          // In-App
          await this.notificationsService.createAndDispatch({
            userId: user.id,
            title: 'Verification Approved',
            body: body,
            type: NotificationType.ACCOUNT,
            data: { status: 'APPROVED' },
          });

          // Email
          if (user.email) {
            await this.emailService.send({
              to: user.email,
              subject,
              text: body,
              html: `<p>${body}</p>`,
            });
          }
        } else if (status === VerificationStatus.REJECTED) {
          const subject = 'Your Business Verification has been Rejected';
          const reasonText = reason ? ` Reason: ${reason}` : '';
          const body = `We regret to inform you that your business verification for Suuq has been rejected.${reasonText}`;

          // In-App
          await this.notificationsService.createAndDispatch({
            userId: user.id,
            title: 'Verification Rejected',
            body: body,
            type: NotificationType.ACCOUNT,
            data: { status: 'REJECTED', reason: reason },
          });

          // Email
          if (user.email) {
            await this.emailService.send({
              to: user.email,
              subject,
              text: body,
              html: `<p>${body}</p>`,
            });
          }
        }
      } catch (err) {
        this.logger.error(
          `Failed to send verification notification to user ${userId}: ${err}`,
        );
      }
    }

    return saved;
  }

  /**
   * Admin action: Confirm or Reject Telebirr Account
   */
  async confirmTelebirrAccount(
    userId: number,
    status: 'APPROVED' | 'REJECTED',
  ): Promise<User> {
    const user = await this.findById(userId);

    if (status === 'APPROVED') {
      if (!user.telebirrAccount) {
        throw new BadRequestException('User has no Telebirr account to verify');
      }
      user.telebirrVerified = true;
      user.telebirrVerifiedAt = new Date();
    } else {
      // REJECTED
      user.telebirrVerified = false;
      user.telebirrVerifiedAt = null;
      // Optionally clear the account or leave it for them to fix.
      // User request says: "Clears the telebirrAccount or sends a notification"
      // I'll clear it.
      user.telebirrAccount = null;
    }

    return this.userRepository.save(user);
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

  async requestSubscription(
    userId: number,
    method: string,
    reference?: string,
    amount?: number,
    currency?: string,
  ): Promise<any> {
    // Deprecated: Subscriptions are removed in favor of Commission + Verification
    throw new BadRequestException(
      'Subscriptions are no longer required. All vendors operate on a Commission model. Please submit your business documents to get Certified (Verified) status for premium features.',
    );
  }

  /* Deprecated Logic kept for reference but disabled
  async requestSubscriptionLegacy(...) { ... }
  */

  async approveSubscription(requestId: number): Promise<SubscriptionRequest> {
    const request = await this.subscriptionRequestRepository.findOne({
      where: { id: requestId },
      relations: ['user'],
    });

    if (!request) {
      throw new NotFoundException('Subscription request not found');
    }

    if (request.status !== SubscriptionRequestStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    request.status = SubscriptionRequestStatus.APPROVED;
    await this.subscriptionRequestRepository.save(request);

    const user = request.user;
    user.subscriptionTier = request.requestedTier;
    this.updateVerifiedFlag(user);
    await this.userRepository.save(user);

    return request;
  }

  async rejectSubscription(requestId: number): Promise<SubscriptionRequest> {
    const request = await this.subscriptionRequestRepository.findOne({
      where: { id: requestId },
      relations: ['user'],
    });

    if (!request) {
      throw new NotFoundException('Subscription request not found');
    }

    if (request.status !== SubscriptionRequestStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    request.status = SubscriptionRequestStatus.REJECTED;
    return this.subscriptionRequestRepository.save(request);
  }

  async findAllSubscriptionRequests(
    page: number = 1,
    limit: number = 20,
    status?: SubscriptionRequestStatus,
  ): Promise<{
    data: SubscriptionRequest[];
    total: number;
    page: number;
    pages: number;
  }> {
    const query = this.subscriptionRequestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.user', 'user')
      .orderBy('request.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) {
      query.where('request.status = :status', { status });
    }

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async findActiveProUsers(
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    pages: number;
  }> {
    const [data, total] = await this.userRepository.findAndCount({
      where: { subscriptionTier: SubscriptionTier.PRO },
      order: { subscriptionExpiry: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Fetch wallets for these users
    const userIds = data.map((u) => u.id);
    let wallets: Wallet[] = [];
    if (userIds.length > 0) {
      wallets = await this.walletRepository.find({
        where: { user: { id: In(userIds) } },
        relations: ['user'],
      });
    }

    const enrichedData = data.map((user) => {
      const wallet = wallets.find((w) => w.user?.id === user.id);
      return {
        ...user,
        walletBalance: wallet ? Number(wallet.balance) : 0,
        walletCurrency: wallet ? wallet.currency : user.currency || 'ETB',
      };
    });

    return {
      data: enrichedData,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async toggleAutoRenew(userId: number, enabled: boolean): Promise<User> {
    const user = await this.findById(userId);
    user.autoRenew = enabled;
    return this.userRepository.save(user);
  }

  async extendSubscription(
    userId: number,
    days: number,
    reason: string,
  ): Promise<User> {
    const user = await this.findById(userId);

    const currentExpiry =
      user.subscriptionExpiry && user.subscriptionExpiry > new Date()
        ? user.subscriptionExpiry
        : new Date();

    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + days);

    user.subscriptionExpiry = newExpiry;
    user.subscriptionTier = SubscriptionTier.PRO; // Ensure they are PRO

    await this.userRepository.save(user);

    // Log this action (optional: could be a wallet transaction with 0 amount or a separate audit log)
    // For now, we'll just log to console, but ideally this should be in an audit table.
    // The prompt mentioned "saved into the transaction description".
    // If we want to save it in WalletTransaction, we need to create a 0 amount transaction or similar.
    // Let's create a 0 amount transaction for record keeping.

    await this.walletService.creditWallet(
      userId,
      0,
      TransactionType.SUBSCRIPTION,
      `[Manual Extension] - Reason: ${reason}`,
    );

    return user;
  }

  private updateVerifiedFlag(user: User) {
    if (user.verificationStatus === VerificationStatus.APPROVED) {
      user.verified = true;
      // Sync legacy tier for analytics compatibility
      user.subscriptionTier = SubscriptionTier.PRO;
      if (!user.verifiedAt) user.verifiedAt = new Date();
    } else {
      user.verified = false;
      user.subscriptionTier = SubscriptionTier.FREE;
    }
  }

  /**
   * Called by WalletService after a successful top-up.
   * Checks if user has a pending WALLET_AUTO subscription request.
   */
  async processPendingWalletSubscription(userId: number) {
    // Deprecated: No more auto-subscription logic.
    return;
  }
}
