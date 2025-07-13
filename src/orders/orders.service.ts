import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderItem, OrderStatus } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CartService } from '../cart/cart.service';
import { User } from '../users/entities/user.entity';


@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly cartService: CartService,
  ) {}

  async createFromCart(userId: number, createOrderDto: CreateOrderDto): Promise<Order> {
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

    const newOrder = this.orderRepository.create({
      user: { id: userId } as User,
      items: orderItems,
      total: total,
      shippingAddress: createOrderDto.shippingAddress,
      status: OrderStatus.PENDING,
    });

    const savedOrder = await this.orderRepository.save(newOrder);
    await this.cartService.clearCart(userId);
    return savedOrder;
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