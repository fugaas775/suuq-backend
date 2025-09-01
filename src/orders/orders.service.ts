import { UserRole } from '../auth/roles.enum';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CartService } from '../cart/cart.service';
import { MpesaService } from '../mpesa/mpesa.service';
import { TelebirrService } from '../telebirr/telebirr.service';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { plainToInstance } from 'class-transformer';
import { OrderResponseDto } from './dto/order-response.dto';

@Injectable()
export class OrdersService {
  /**
   * Find all orders for admin with pagination and optional status filter.
   * Returns { orders, total } for pagination.
   */
  async findAllForAdmin(query: {
    page?: number;
    limit?: number;
    pageSize?: number;
    status?: string;
  }): Promise<{ data: OrderResponseDto[]; total: number }> {
    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.deliverer', 'deliverer')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor');

    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limitInput = query.limit ?? query.pageSize;
    const limit = limitInput && limitInput > 0 ? limitInput : 20;
    qb.skip((page - 1) * limit).take(limit);

    const [orders, total] = await qb.getManyAndCount();
    const response = orders.map((order) => {
      type VendorLike = {
        id?: number;
        displayName?: string | null;
        storeName?: string | null;
      };
      const vendorsMap = new Map<number, VendorLike & { id: number }>();
      for (const it of order.items || []) {
        const vendor = it.product?.vendor as VendorLike | undefined;
        if (
          vendor &&
          typeof vendor.id === 'number' &&
          !vendorsMap.has(vendor.id)
        ) {
          vendorsMap.set(vendor.id, {
            id: vendor.id,
            displayName: vendor.displayName ?? null,
            storeName: vendor.storeName ?? null,
          });
        }
      }
      const vendors = Array.from(vendorsMap.values());
      const deliverer = order.deliverer as
        | (User & {
            displayName?: string | null;
            email?: string | null;
            phoneNumber?: string | null;
          })
        | undefined;
      return plainToInstance(OrderResponseDto, {
        ...order,
        userId: order.user?.id,
        delivererId: deliverer?.id,
        delivererName: deliverer?.displayName ?? null,
        delivererEmail: deliverer?.email ?? null,
        delivererPhone: deliverer?.phoneNumber ?? null,
        vendors,
        vendorName:
          vendors.length === 1
            ? vendors[0].storeName || vendors[0].displayName || null
            : null,
        items: (order.items || []).map((item) => ({
          productId: item.product?.id,
          quantity: item.quantity,
          price: item.price,
        })),
      });
    });
    return { data: response, total };
  }

  /**
   * Get total revenue from all PAID orders.
   */
  async getTotalRevenue(): Promise<number> {
    const raw = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.total)', 'sum')
      .where('order.paymentStatus = :status', { status: PaymentStatus.PAID })
      .getRawOne<{ sum: string | number | null }>();
    const sum = raw?.sum;
    return typeof sum === 'number' ? sum : sum ? Number(sum) : 0;
  }

  /**
   * Count all orders in the database.
   */
  async countAll(): Promise<number> {
    return this.orderRepository.count();
  }
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly cartService: CartService,
    private readonly mpesaService: MpesaService,
    private readonly telebirrService: TelebirrService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Cancel an order as admin. Sets status to CANCELLED.
   */
  async cancelOrderForAdmin(orderId: number): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.DELIVERED
    ) {
      throw new BadRequestException('Order cannot be cancelled');
    }
    order.status = OrderStatus.CANCELLED;
    // TODO: Add restocking logic here if needed
    await this.orderRepository.save(order);
    return order;
  }

  async assignDeliverer(orderId: number, delivererId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    const deliverer = await this.orderRepository.manager.findOne(User, {
      where: { id: delivererId },
    });
    if (!deliverer || !deliverer.roles?.includes(UserRole.DELIVERER)) {
      throw new BadRequestException('User is not a deliverer');
    }
    order.deliverer = deliverer;
    order.status = OrderStatus.SHIPPED;
    await this.orderRepository.save(order);
    // Send notification to deliverer
    await this.notificationsService.sendToUser({
      userId: delivererId,
      title: 'New Delivery Assigned',
      body: `You have been assigned to deliver order #${orderId}`,
    });
    return order;
  }

  async createFromCart(
    userId: number,
    createOrderDto: CreateOrderDto,
  ): Promise<any> {
    const cart = await this.cartService.getCart(userId);
    if (cart.items.length === 0) {
      throw new BadRequestException(
        'Cannot create an order from an empty cart.',
      );
    }

    const orderItems = cart.items.map((item) => {
      const orderItem = new OrderItem();
      orderItem.product = item.product;
      orderItem.quantity = item.quantity;
      orderItem.price = Number(item.product.price);
      return orderItem;
    });

    const total = orderItems.reduce(
      (sum: number, item: OrderItem) => sum + item.price * item.quantity,
      0,
    );

    // Payment method branching
    const { paymentMethod, phoneNumber } = createOrderDto;
    let newOrder: Order;
    if (paymentMethod === 'COD') {
      newOrder = this.orderRepository.create({
        user: { id: userId } as User,
        items: orderItems,
        total: total,
        shippingAddress: createOrderDto.shippingAddress,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.UNPAID,
        status: OrderStatus.PENDING,
      });
      const savedOrder = await this.orderRepository.save(newOrder);
      await this.cartService.clearCart(userId);
      return savedOrder;
    } else if (paymentMethod === 'MPESA') {
      if (!phoneNumber || !phoneNumber.trim()) {
        throw new BadRequestException(
          'phoneNumber is required for MPESA payments.',
        );
      }
      newOrder = this.orderRepository.create({
        user: { id: userId } as User,
        items: orderItems,
        total: total,
        shippingAddress: createOrderDto.shippingAddress,
        paymentMethod: PaymentMethod.MPESA,
        paymentStatus: PaymentStatus.UNPAID,
        status: OrderStatus.PENDING,
      });
      const savedOrder = await this.orderRepository.save(newOrder);
      await this.mpesaService.initiateStkPush(
        total,
        phoneNumber,
        savedOrder.id,
      );
      await this.cartService.clearCart(userId);
      return savedOrder;
    } else if (paymentMethod === 'TELEBIRR') {
      if (!phoneNumber || !phoneNumber.trim()) {
        throw new BadRequestException(
          'phoneNumber is required for TELEBIRR payments.',
        );
      }
      newOrder = this.orderRepository.create({
        user: { id: userId } as User,
        items: orderItems,
        total: total,
        shippingAddress: createOrderDto.shippingAddress,
        paymentMethod: PaymentMethod.TELEBIRR,
        paymentStatus: PaymentStatus.UNPAID,
        status: OrderStatus.PENDING,
      });
      const savedOrder = await this.orderRepository.save(newOrder);
      const checkoutUrl = await this.telebirrService.createPayment(
        total,
        savedOrder.id,
        phoneNumber,
      );
      await this.cartService.clearCart(userId);
      return { order: savedOrder, checkoutUrl };
    } else {
      throw new BadRequestException(
        'Unsupported payment method. Only COD, MPESA, and TELEBIRR are currently supported.',
      );
    }
  }

  async findAllForUser(
    userId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: OrderResponseDto[]; total: number }> {
    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('order.deliverer', 'deliverer')
      .where('order.userId = :userId', { userId })
      .orderBy('order.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [orders, total] = await qb.getManyAndCount();
    const response = orders.map((order) =>
      plainToInstance(OrderResponseDto, {
        ...order,
        userId: order.user?.id,
        delivererId: order.deliverer?.id,
        items:
          order.items?.map((item) => ({
            productId: item.product?.id,
            productName: item.product?.name,
            productImageUrl: item.product?.imageUrl ?? null,
            quantity: item.quantity,
            price: item.price,
          })) || [],
      }),
    );
    return { data: response, total };
  }

  async findOneForUser(userId: number, orderId: number): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, user: { id: userId } },
      relations: ['items', 'items.product', 'deliverer'],
    });
    if (!order) {
      throw new NotFoundException(
        'Order not found or you do not have permission to view it.',
      );
    }
    return order;
  }

  /**
   * Hard delete an order and its children. Irreversible.
   * Ensures FK constraints are satisfied. Returns void (204 No Content at controller).
   */
  async hardDelete(id: number): Promise<void> {
    const existing = await this.orderRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Order not found');
    }
    // If relations aren't cascaded, manually delete children first.
    // OrderItem has onDelete: 'CASCADE', but ensure cleanup explicitly for safety in older rows.
    await this.orderRepository.manager
      .createQueryBuilder()
      .delete()
      .from(OrderItem)
      .where('orderId = :id', { id })
      .execute();

    // If you later add payments/shipments tables, delete them here similarly.

    await this.orderRepository.delete(id);
  }
}
