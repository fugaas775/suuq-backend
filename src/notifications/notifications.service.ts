import { Injectable, NotFoundException } from '@nestjs/common';
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
    const notification = await this.notificationRepo.findOne({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');
    return notification;
  }

  async remove(id: number) {
    const result = await this.notificationRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Notification not found');
    return { deleted: true };
  }
}