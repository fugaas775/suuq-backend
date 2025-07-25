import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { User, VerificationStatus } from './entities/user.entity'; // Import VerificationStatus enum
import { UserRole } from '../auth/roles.enum';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
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
   * Find all users with optional filtering and pagination for admin panel.
   * Returns { users, total } for pagination.
   */
  async findAll(filters?: FindUsersQueryDto & { page?: number; pageSize?: number }): Promise<{ users: User[]; total: number }> {
    const qb = this.userRepository.createQueryBuilder('user');

    if (filters?.role) {
      qb.andWhere('user.roles @> :roles', { roles: [filters.role] });
    }

    if (filters?.search) {
      qb.andWhere('(user.displayName ILIKE :search OR user.storeName ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }

    // Pagination
    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const pageSize = filters?.pageSize && filters.pageSize > 0 ? filters.pageSize : 20;
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [users, total] = await qb.getManyAndCount();
    return { users, total };
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
    return this.userRepository.createQueryBuilder('user')
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
      'isActive',
      // Verification fields for admin
      'verificationStatus',
      'verificationDocuments',
      'verified',
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
    const existing = await this.userRepository.findOne({ where: { email: payload.email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }
    const user = this.userRepository.create({
      email: payload.email,
      displayName: payload.name || `${payload.given_name || ''} ${payload.family_name || ''}`.trim(),
      avatarUrl: payload.picture,
      googleId: payload.sub,
      roles: payload.roles && payload.roles.length > 0 ? payload.roles : [UserRole.CUSTOMER],
      // password is omitted rather than set to null
      isActive: true,
    });
    return this.userRepository.save(user);
  }
}