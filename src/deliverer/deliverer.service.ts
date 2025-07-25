import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../orders/entities/order.entity';

@Injectable()
export class DelivererService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async getMyAssignments(delivererId: number) {
    return this.orderRepository.find({
      where: { deliverer: { id: delivererId } },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateDeliveryStatus(delivererId: number, orderId: number, newStatus: OrderStatus) {
    const order = await this.orderRepository.findOne({ where: { id: orderId }, relations: ['deliverer'] });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliverer || order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You are not assigned to this order');
    }
    order.status = newStatus;
    await this.orderRepository.save(order);
    return order;
  }
}
