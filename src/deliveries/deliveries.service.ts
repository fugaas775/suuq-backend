import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from './entities/delivery.entity';
import { DeliveryStatus } from './entities/delivery.entity';

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
  ) {}

  async assignToOrder(orderId: number, delivererId: number) {
    const delivery = this.deliveryRepo.create({
      order: { id: orderId },
      deliverer: { id: delivererId },
      status: DeliveryStatus.ASSIGNED, // Use ASSIGNED, or add PENDING to enum if you want
    });
    return this.deliveryRepo.save(delivery);
  }

  async getMyDeliveries(delivererId: number) {
    return this.deliveryRepo.find({
      where: { deliverer: { id: delivererId } },
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatus(id: number, status: Delivery['status']) {
    const delivery = await this.deliveryRepo.findOne({ where: { id } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    delivery.status = status;
    return this.deliveryRepo.save(delivery);
  }

  async getAllDeliveries() {
    return this.deliveryRepo.find({
      relations: ['order', 'order.product', 'order.product.vendor', 'deliverer'],
      order: { createdAt: 'DESC' },
    });
  }
}