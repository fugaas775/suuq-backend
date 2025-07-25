import { UserRole } from '../auth/roles.enum';
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CartService } from '../cart/cart.service';
import { MpesaService } from '../mpesa/mpesa.service';
import { TelebirrService } from '../telebirr/telebirr.service';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';


@Injectable()
export class OrdersService {
  /**
   * Find all orders for admin with pagination and optional status filter.
   * Returns { orders, total } for pagination.
   */
  async findAllForAdmin(query: { page?: number; pageSize?: number; status?: string }): Promise<{ orders: Order[]; total: number }> {
    const qb = this.orderRepository.createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.items', 'items');

    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [orders, total] = await qb.getManyAndCount();
    return { orders, total };
  }

  /**
   * Get total revenue from all PAID orders.
   */
  async getTotalRevenue(): Promise<number> {
    const result = await this.orderRepository.createQueryBuilder('order')
      .select('SUM(order.total)', 'sum')
      .where('order.paymentStatus = :status', { status: 'PAID' })
      .getRawOne();
    return Number(result.sum) || 0;
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
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.DELIVERED) {
      throw new BadRequestException('Order cannot be cancelled');
    }
    order.status = OrderStatus.CANCELLED;
    // TODO: Add restocking logic here if needed
    await this.orderRepository.save(order);
    return order;
  }

  async assignDeliverer(orderId: number, delivererId: number) {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    const deliverer = await this.orderRepository.manager.findOne(User, { where: { id: delivererId } });
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


  async createFromCart(userId: number, createOrderDto: CreateOrderDto): Promise<any> {
    const cart = await this.cartService.getCart(userId);
    if (cart.items.length === 0) {
      throw new BadRequestException('Cannot create an order from an empty cart.');
    }

    const orderItems = cart.items.map(item => {
      const orderItem = new OrderItem();
      orderItem.product = item.product;
      orderItem.quantity = item.quantity;
      orderItem.price = Number(item.product.price);
      return orderItem;
    });

    const total = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Payment method branching
    const { paymentMethod, phoneNumber } = createOrderDto;
    let newOrder: Order;
    if (paymentMethod === PaymentMethod.COD) {
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
    } else if (paymentMethod === PaymentMethod.MPESA) {
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
      await this.mpesaService.initiateStkPush(total, phoneNumber, savedOrder.id);
      await this.cartService.clearCart(userId);
      return savedOrder;
    } else if (paymentMethod === PaymentMethod.TELEBIRR) {
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
      const checkoutUrl = await this.telebirrService.createPayment(total, savedOrder.id, phoneNumber);
      await this.cartService.clearCart(userId);
      return { order: savedOrder, checkoutUrl };
    } else {
      throw new BadRequestException('Unsupported payment method. Only COD, MPESA, and TELEBIRR are currently supported.');
    }
  }

  async findAllForUser(userId: number): Promise<Order[]> {
    return this.orderRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneForUser(userId: number, orderId: number): Promise<Order> {
    const order = await this.orderRepository.findOne({ where: { id: orderId, user: { id: userId } } });
    if (!order) {
      throw new NotFoundException('Order not found or you do not have permission to view it.');
    }
    return order;
  }
}