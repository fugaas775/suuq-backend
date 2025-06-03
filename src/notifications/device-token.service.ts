import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceToken } from './device-token.entity';
import { User } from '../users/user.entity';

@Injectable()
export class DeviceTokenService {
  constructor(
    @InjectRepository(DeviceToken)
    private deviceTokenRepo: Repository<DeviceToken>,
  ) {}

  async registerToken(user: User, token: string) {
    const exists = await this.deviceTokenRepo.findOne({ where: { user, token } });
    if (!exists) {
      const newToken = this.deviceTokenRepo.create({ user, token });
      await this.deviceTokenRepo.save(newToken);
    }
    return { registered: true };
  }
}
