import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceToken } from './entities/device-token.entity'; // <-- FIXED IMPORT
import { User } from '../users/entities/user.entity';

@Injectable()
export class DeviceTokenService {
  constructor(
    @InjectRepository(DeviceToken)
    private deviceTokenRepo: Repository<DeviceToken>,
  ) {}

  async registerToken(user: User, token: string) {
    // Use user.id to avoid potential TypeORM deep object equality issues
    const exists = await this.deviceTokenRepo.findOne({ where: { user: { id: user.id }, token } });
    if (!exists) {
      const newToken = this.deviceTokenRepo.create({ user, token });
      await this.deviceTokenRepo.save(newToken);
    }
    return { registered: true };
  }
}