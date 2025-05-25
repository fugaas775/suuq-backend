// src/notifications/notifications.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { Repository } from 'typeorm';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  async create(title: string, message: string) {
    const notification = this.notificationRepo.create({ title, message });
    return this.notificationRepo.save(notification);
  }

  async findAll() {
    return this.notificationRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number) {
    return this.notificationRepo.findOne({ where: { id } });
  }

  async remove(id: number) {
    await this.notificationRepo.delete(id);
    return { deleted: true };
  }
}
