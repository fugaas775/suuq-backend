import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';

@Injectable()
export class DelivererService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  @InjectRepository(Product)
  private readonly productRepository: Repository<Product>,
  ) {}

  async getMyAssignments(delivererId: number) {
    const orders = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .where('o.delivererId = :delivererId', { delivererId })
      .orderBy('o.createdAt', 'DESC')
      .getMany();

    return orders.map((o) => {
      const vendorsMap = new Map<number, { id: number; displayName?: string | null; storeName?: string | null; phone?: string | null; phoneCountryCode?: string | null }>();
      for (const it of o.items || []) {
        const v: any = (it as any).product?.vendor;
        if (v?.id && !vendorsMap.has(v.id)) {
          vendorsMap.set(v.id, {
            id: v.id,
            displayName: v.displayName || null,
            storeName: v.storeName || null,
            phone: v.vendorPhoneNumber || v.phoneNumber || null,
            phoneCountryCode: v.phoneCountryCode || null,
          });
        }
      }
      const vendors = Array.from(vendorsMap.values());
      return {
        ...o,
        vendors,
        vendorName: vendors.length === 1 ? (vendors[0].storeName || vendors[0].displayName || null) : null,
      } as any;
    });
  }

  async updateDeliveryStatus(delivererId: number, orderId: number, newStatus: OrderStatus) {
    const order = await this.orderRepository.findOne({ where: { id: orderId }, relations: ['deliverer', 'items', 'items.product'] });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliverer || order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You are not assigned to this order');
    }
    const wasDelivered = order.status === OrderStatus.DELIVERED;
    order.status = newStatus;
    await this.orderRepository.save(order);

    // If transitioning to DELIVERED for the first time, increment product sales_count by item quantities
    if (!wasDelivered && newStatus === OrderStatus.DELIVERED && Array.isArray(order.items)) {
      const productQuantities = new Map<number, number>();
      for (const it of order.items) {
        const pid = (it as any).product?.id;
        if (pid) {
          productQuantities.set(pid, (productQuantities.get(pid) || 0) + (it.quantity || 0));
        }
      }
      if (productQuantities.size > 0) {
        for (const [productId, qty] of productQuantities.entries()) {
          await this.productRepository.createQueryBuilder()
            .update(Product)
            .set({ sales_count: () => `COALESCE(sales_count, 0) + ${Math.max(0, qty)}` })
            .where('id = :productId', { productId })
            .execute();
        }
      }
    }

    // Return enriched detail including vendor summaries
    const fresh = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .where('o.id = :orderId', { orderId })
      .getOne();
    if (!fresh) return order;
    const vendorsMap = new Map<number, { id: number; displayName?: string | null; storeName?: string | null; phone?: string | null; phoneCountryCode?: string | null }>();
    for (const it of (fresh.items || [])) {
      const v: any = (it as any).product?.vendor;
      if (v?.id && !vendorsMap.has(v.id)) {
        vendorsMap.set(v.id, {
          id: v.id,
          displayName: v.displayName || null,
          storeName: v.storeName || null,
          phone: v.vendorPhoneNumber || v.phoneNumber || null,
          phoneCountryCode: v.phoneCountryCode || null,
        });
      }
    }
    const vendors = Array.from(vendorsMap.values());
    return {
      ...fresh,
      vendors,
      vendorName: vendors.length === 1 ? (vendors[0].storeName || vendors[0].displayName || null) : null,
    } as any;
  }

  async getMyAssignmentDetail(delivererId: number, orderId: number) {
    const order = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .where('o.id = :orderId', { orderId })
      .andWhere('o.delivererId = :delivererId', { delivererId })
      .getOne();
    if (!order) throw new NotFoundException('Order not found');

    const vendorsMap = new Map<number, { id: number; displayName?: string | null; storeName?: string | null; phone?: string | null; phoneCountryCode?: string | null }>();
    for (const it of (order.items || [])) {
      const v: any = (it as any).product?.vendor;
      if (v?.id && !vendorsMap.has(v.id)) {
        vendorsMap.set(v.id, {
          id: v.id,
          displayName: v.displayName || null,
          storeName: v.storeName || null,
          phone: v.vendorPhoneNumber || v.phoneNumber || null,
          phoneCountryCode: v.phoneCountryCode || null,
        });
      }
    }
    const vendors = Array.from(vendorsMap.values());
    return {
      ...order,
      vendors,
      vendorName: vendors.length === 1 ? (vendors[0].storeName || vendors[0].displayName || null) : null,
    } as any;
  }
}
