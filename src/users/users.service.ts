import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Create a new user (local or otherwise).
   */
  async create(data: Partial<User>): Promise<User> {
    const user = this.userRepository.create(data);
    return this.userRepository.save(user);
  }

  /**
   * Find user by email, returning essential login fields.
   */
  async findByEmail(email: string): Promise<User | null> {
    // Updated select: ensures Google login and DTO get all common fields
    return this.userRepository.findOne({
      where: { email },
      select: [
        'id',
        'email',
        'password',
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
   * Get all users.
   */
  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  /**
   * Update user by ID.
   */
  async update(id: number, data: Partial<User>): Promise<User> {
    const result = await this.userRepository.update(id, data);
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

  /**
   * Create a user using Google profile payload.
   * Prevents duplicate emails, sets defaults, and saves Google-specific fields.
   * @param payload - Google user info (expects email, name, picture, sub, etc.)
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
      password: `google_sso_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      isActive: true,
    });
    return this.userRepository.save(user);
  }
}
