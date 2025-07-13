import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { User } from './entities/user.entity'; 
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
      select: [
        'id',
        'email',
        'roles',
        'isActive',
        'displayName',
        'avatarUrl',
        'storeName',
        'googleId',
      ],
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
   * --- UPDATED: Find all users with optional filtering ---
   */
  async findAll(filters?: FindUsersQueryDto): Promise<User[]> {
    const qb = this.userRepository.createQueryBuilder('user');

    if (filters?.role) {
      // In PostgreSQL, `@>` checks if the array on the left contains the array on the right
      qb.andWhere('user.roles @> :roles', { roles: [filters.role] });
    }

    if (filters?.search) {
      // Search by display name OR store name
      qb.andWhere('(user.displayName ILIKE :search OR user.storeName ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }

    // Add pagination later if needed
    // qb.skip((page - 1) * perPage).take(perPage);

    return qb.getMany();
  }

  /**
   * Update user by ID.
   * If password is present, hash it before updating.
   */
  async update(id: number, data: Partial<User>): Promise<User> {
    // Only allow safe fields to be updated
    const allowedFields: (keyof User)[] = [
      'displayName',
      'avatarUrl',
      'storeName',
      'phoneCountryCode',
      'phoneNumber',
      'isActive',
    ];
    const updateData: Partial<User> = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        (updateData as any)[key] = data[key];
      }
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