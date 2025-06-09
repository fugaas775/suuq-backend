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

  // ADMIN: Assign a delivery to a deliverer
  async assignToOrder(orderId: number, delivererId: number) {
    // If you want to update existing delivery, you can fetch and update
    let delivery = await this.deliveryRepo.findOne({ where: { order: { id: orderId } } });
    if (delivery) {
      delivery.deliverer = { id: delivererId } as any;
      delivery.status = DeliveryStatus.ASSIGNED;
    } else {
      delivery = this.deliveryRepo.create({
        order: { id: orderId } as any,
        deliverer: { id: delivererId } as any,
        status: DeliveryStatus.ASSIGNED,
      });
    }
    return this.deliveryRepo.save(delivery);
  }

  // DELIVERER: Get their deliveries
  async getMyDeliveries(delivererId: number) {
    return this.deliveryRepo.find({
      where: { deliverer: { id: delivererId } },
      order: { createdAt: 'DESC' },
      relations: ['order', 'order.product', 'order.product.vendor'],
    });
  }

  // DELIVERER: Update delivery status
  async updateStatus(id: number, status: Delivery['status']) {
    const delivery = await this.deliveryRepo.findOne({ where: { id } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    delivery.status = status;
    return this.deliveryRepo.save(delivery);
  }

  // ADMIN: Get all deliveries
  async getAllDeliveries() {
    return this.deliveryRepo.find({
      relations: ['order', 'order.product', 'order.product.vendor', 'deliverer'],
      order: { createdAt: 'DESC' },
    });
  }
}