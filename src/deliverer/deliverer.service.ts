import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Order,
  OrderStatus,
  DeliveryAcceptanceStatus,
} from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { WalletService } from '../wallet/wallet.service';
import { TransactionType } from '../wallet/entities/wallet-transaction.entity';
import { SettingsService } from '../settings/settings.service';
import { EmailService } from '../email/email.service';
import { CurrencyService } from '../common/services/currency.service';
import { Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { buildOrderStatusNotification } from '../orders/order-notifications.util';

@Injectable()
export class DelivererService {
  private readonly logger = new Logger(DelivererService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly walletService: WalletService,
    private readonly settingsService: SettingsService,
    private readonly emailService: EmailService,
    private readonly currencyService: CurrencyService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async notifyOrderStatusChange(order: Order, status: OrderStatus) {
    let userId = order?.user?.id;
    if (!userId) {
      const withUser = await this.orderRepository.findOne({
        where: { id: order.id },
        relations: ['user'],
      });
      userId = withUser?.user?.id;
    }

    if (!userId) return;

    const payload = buildOrderStatusNotification(order.id, status);
    await this.notificationsService.createAndDispatch({
      userId,
      title: payload.title,
      body: payload.body,
      type: NotificationType.ORDER,
      data: payload.data,
    });
  }

  private async notifyVendorsStatusChange(order: Order, status: OrderStatus) {
    if (!order.items || order.items.length === 0) return;

    // Identify unique vendors involved in the order
    const vendorIds = new Set<number>();
    order.items.forEach((item) => {
      const v = (item.product as any)?.vendor;
      if (v?.id) vendorIds.add(v.id);
    });

    const statusTitle =
      status === OrderStatus.OUT_FOR_DELIVERY
        ? 'Order Picked Up'
        : 'Order Update';
    const statusBody =
      status === OrderStatus.OUT_FOR_DELIVERY
        ? `Order #${order.id} has been picked up by the deliverer.`
        : `Order #${order.id} status updated to ${status}.`;

    for (const vendorId of vendorIds) {
      await this.notificationsService.createAndDispatch({
        userId: vendorId,
        title: statusTitle,
        body: statusBody,
        type: NotificationType.ORDER,
        data: {
          type: 'vendor_order',
          id: String(order.id),
          route: `/vendor-order-detail?id=${order.id}`,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      });
    }
  }

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
      const vendorsMap = new Map<
        number,
        {
          id: number;
          displayName?: string | null;
          storeName?: string | null;
          phone?: string | null;
          phoneCountryCode?: string | null;
        }
      >();
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
        vendorName:
          vendors.length === 1
            ? vendors[0].storeName || vendors[0].displayName || null
            : null,
      } as any;
    });
  }

  async acceptAssignment(delivererId: number, orderId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['deliverer'],
    });

    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliverer || order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You are not assigned to this order');
    }

    if (order.deliveryAcceptanceStatus === DeliveryAcceptanceStatus.ACCEPTED) {
      return order; // Already accepted
    }

    order.deliveryAcceptanceStatus = DeliveryAcceptanceStatus.ACCEPTED;
    // Ensure status is SHIPPED (it should be, but just in case)
    order.status = OrderStatus.SHIPPED;

    await this.orderRepository.save(order);

    // Optionally notify vendor/admin that order is accepted
    // For now, no specific notification needed unless requested.

    return order;
  }

  async rejectAssignment(delivererId: number, orderId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['deliverer'],
    });

    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliverer || order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You are not assigned to this order');
    }

    // Reset assignment
    order.deliverer = undefined; // Nullify logic might vary based on cascading
    // or set delivererId = null if TypeORM handles it.
    // Usually assigning null to relation works if nullable: true.
    order.deliveryAcceptanceStatus = DeliveryAcceptanceStatus.REJECTED;
    order.status = OrderStatus.PROCESSING; // Revert status so it appears back in "Ready to ship" lists

    // Use query builder to nullify delivererId to be safe with FKs
    await this.orderRepository
      .createQueryBuilder()
      .update(Order)
      .set({
        deliverer: null,
        status: OrderStatus.PROCESSING,
        deliveryAcceptanceStatus: DeliveryAcceptanceStatus.REJECTED,
      })
      .where('id = :id', { id: orderId })
      .execute();

    return { success: true };
  }

  async confirmPickup(delivererId: number, orderId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'deliverer',
        'user',
        'items',
        'items.product',
        'items.product.vendor',
      ],
    });

    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliverer || order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You are not assigned to this order');
    }

    // Ensure it was accepted
    if (order.deliveryAcceptanceStatus !== DeliveryAcceptanceStatus.ACCEPTED) {
      throw new ForbiddenException(
        'You must accept the assignment before picking up.',
      );
    }

    if (order.status === OrderStatus.OUT_FOR_DELIVERY) {
      return order; // Already picked up
    }

    order.status = OrderStatus.OUT_FOR_DELIVERY;
    await this.orderRepository.save(order);

    // Notify Customer
    await this.notifyOrderStatusChange(order, OrderStatus.OUT_FOR_DELIVERY);

    // Notify Vendors
    await this.notifyVendorsStatusChange(order, OrderStatus.OUT_FOR_DELIVERY);

    return order;
  }

  async updateDeliveryStatus(
    delivererId: number,
    orderId: number,
    newStatus: OrderStatus,
  ) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'deliverer',
        'user',
        'items',
        'items.product',
        'items.product.vendor',
      ],
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliverer || order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You are not assigned to this order');
    }
    const wasDelivered = order.status === OrderStatus.DELIVERED;
    order.status = newStatus;
    await this.orderRepository.save(order);
    await this.notifyOrderStatusChange(order, newStatus);

    if (!wasDelivered && newStatus === OrderStatus.DELIVERED) {
      // Need to re-fetch user for email if not in relations (or trust it's there via ManyToOne eager? Order.user is eager but query didn't request it explicitly, however eager loads unless disabled. Let's start with checking relations above... relations doesn't list 'user'. But entity has eager: true. So it should be there.)
      // To be safe, let's ensure we have the user email.
      if (!order.user) {
        const orderWithUser = await this.orderRepository.findOne({
          where: { id: orderId },
          relations: ['user'],
        });
        if (orderWithUser && orderWithUser.user) {
          order.user = orderWithUser.user;
        }
      }
      this.emailService
        .sendOrderDelivered(order)
        .catch((e) =>
          this.logger.error(
            `Failed to send order delivered email: ${e.message}`,
          ),
        );
    }

    // If transitioning to DELIVERED for the first time, increment product sales_count by item quantities
    if (
      !wasDelivered &&
      newStatus === OrderStatus.DELIVERED &&
      Array.isArray(order.items)
    ) {
      // 1. Increment Sales Count
      const productQuantities = new Map<number, number>();
      for (const it of order.items) {
        const pid = (it as any).product?.id;
        if (pid) {
          productQuantities.set(
            pid,
            (productQuantities.get(pid) || 0) + (it.quantity || 0),
          );
        }
      }
      if (productQuantities.size > 0) {
        for (const [productId, qty] of productQuantities.entries()) {
          await this.productRepository
            .createQueryBuilder()
            .update(Product)
            .set({
              sales_count: () =>
                `COALESCE(sales_count, 0) + ${Math.max(0, qty)}`,
            })
            .where('id = :productId', { productId })
            .execute();
        }
      }

      // 2. Credit Wallets (Vendor & Deliverer)
      // Fetch dynamic settings (defaults: 50 base fee)
      const deliveryFeeVal = await this.settingsService.getSetting(
        'delivery_base_fee',
        50,
      );
      const commissionPercent =
        Number(
          await this.settingsService.getSystemSetting(
            'VENDOR_COMMISSION_PERCENT',
          ),
        ) || 5; // Default 5% commission
      const orderCurrency = order.currency || 'ETB';

      // Group items by Vendor
      const vendorEarnings = new Map<number, number>();
      for (const item of order.items || []) {
        const vendorId = (item.product as any)?.vendor?.id;
        if (vendorId) {
          const itemTotal = Number(item.price) * Number(item.quantity);
          vendorEarnings.set(
            vendorId,
            (vendorEarnings.get(vendorId) || 0) + itemTotal,
          );
        }
      }

      // Credit Vendors
      for (const [vendorId, total] of vendorEarnings.entries()) {
        const gross = total;
        // Apply commission
        const commission = gross * (commissionPercent / 100);
        const net = gross - commission;

        if (net > 0) {
          try {
            // Convert currency
            const vendorWallet = await this.walletService.getWallet(vendorId);
            const walletCurrency = vendorWallet.currency || 'KES';

            let amountToCredit = net;
            if (orderCurrency !== walletCurrency) {
              amountToCredit = this.currencyService.convert(
                net,
                orderCurrency,
                walletCurrency,
              );
            }

            await this.walletService.creditWallet(
              vendorId,
              amountToCredit,
              TransactionType.EARNING,
              `Earnings from Order #${orderId} (${orderCurrency} ${net.toFixed(
                2,
              )})`,
              order.id,
            );
          } catch (e: any) {
            this.logger.error(
              `Failed to credit vendor ${vendorId}: ${e.message}`,
            );
          }
        }
      }

      // Credit Deliverer
      const DELIVERY_FEE = Number(deliveryFeeVal);
      // No commission on delivery fee
      if (DELIVERY_FEE > 0) {
        try {
          const delivererWallet =
            await this.walletService.getWallet(delivererId);
          const walletCurrency = delivererWallet.currency || 'KES';
          // Assume Base Fee is in 'ETB' for EA market context
          const baseFeeCurrency = 'ETB';

          let amountToCredit = DELIVERY_FEE;
          if (baseFeeCurrency !== walletCurrency) {
            amountToCredit = this.currencyService.convert(
              DELIVERY_FEE,
              baseFeeCurrency,
              walletCurrency,
            );
          }

          await this.walletService.creditWallet(
            delivererId,
            amountToCredit,
            TransactionType.EARNING,
            `Delivery Fee for Order #${orderId}`,
            order.id,
          );
        } catch (e: any) {
          this.logger.error(
            `Failed to credit deliverer ${delivererId}: ${e.message}`,
          );
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
    const vendorsMap = new Map<
      number,
      {
        id: number;
        displayName?: string | null;
        storeName?: string | null;
        phone?: string | null;
        phoneCountryCode?: string | null;
      }
    >();
    for (const it of fresh.items || []) {
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
      vendorName:
        vendors.length === 1
          ? vendors[0].storeName || vendors[0].displayName || null
          : null,
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

    const vendorsMap = new Map<
      number,
      {
        id: number;
        displayName?: string | null;
        storeName?: string | null;
        phone?: string | null;
        phoneCountryCode?: string | null;
      }
    >();
    for (const it of order.items || []) {
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
      vendorName:
        vendors.length === 1
          ? vendors[0].storeName || vendors[0].displayName || null
          : null,
    } as any;
  }
}
