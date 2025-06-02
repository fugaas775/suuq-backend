import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(data: Partial<User>) {
    const user = this.userRepository.create(data);
    return this.userRepository.save(user);
  }

  async findByEmail(email: string) {
    return this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'password', 'role'], // ✅ include password!
    });
  }

  async findOne(id: number) {
    return this.userRepository.findOne({ where: { id } });
  }

  async delete(id: number) {
    return this.userRepository.delete(id);
  }

  async remove(id: number) {
    return this.userRepository.delete(id);
  }

  async findAll() {
    return this.userRepository.find();
  }
}
