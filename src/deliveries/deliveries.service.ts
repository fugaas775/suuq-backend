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
      delivererId,
      status: DeliveryStatus.PENDING,
    });
    return this.deliveryRepo.save(delivery);
  }

  async getMyDeliveries(delivererId: number) {
    return this.deliveryRepo.find({
      where: { delivererId },
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
    relations: ['order', 'order.product', 'order.product.vendor'],
    order: { createdAt: 'DESC' },
    });
  }


}
