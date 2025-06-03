import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(data: Partial<User>): Promise<User> {
    const user = this.userRepository.create(data);
    return this.userRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'password', 'roles', 'isActive'],
    });
  }

  async findOne(id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findById(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async remove(id: number): Promise<void> {
    const result = await this.userRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async update(id: number, data: Partial<User>): Promise<User> {
    const result = await this.userRepository.update(id, data);
    if (result.affected === 0) {
        throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return this.findById(id);
  }

  async deactivate(id: number): Promise<User> {
    await this.userRepository.update(id, { isActive: false });
    return this.findById(id);
  }

  async reactivate(id: number): Promise<User> {
    await this.userRepository.update(id, { isActive: true });
    return this.findById(id);
  }

  async getMe(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
