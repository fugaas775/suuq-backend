// src/admin-deliveries/admin-deliveries.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery, DeliveryStatus } from '../../deliveries/entities/delivery.entity';

@Injectable()
export class AdminDeliveriesService {
  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
  ) {}

  async getAll() {
    return this.deliveryRepo.find({
      relations: ['order', 'order.product', 'order.product.vendor'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatus(id: number, status: DeliveryStatus) {
    const delivery = await this.deliveryRepo.findOne({
      where: { id },
      relations: ['order'],
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    delivery.status = status;
    return this.deliveryRepo.save(delivery);
  }
}
