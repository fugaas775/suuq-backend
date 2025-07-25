
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CreateVendorProductDto } from './dto/create-vendor-product.dto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { UserRole } from '../auth/roles.enum';

@Injectable()
export class VendorService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async getSalesGraph(userId: number, query: any) {
    // TODO: Replace with real sales analytics logic
    // Example: return sales grouped by day for the vendor
    return {
      range: query.range || '30d',
      data: [
        { date: '2025-07-01', sales: 10 },
        { date: '2025-07-02', sales: 12 },
        { date: '2025-07-03', sales: 8 },
        // ...
      ]
    };
  }
  async updateOrderStatus(userId: number, orderId: number, newStatus: OrderStatus) {
    // Fetch order with items, products, and vendors
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['items', 'items.product', 'items.product.vendor'],
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    // Check if any product in the order belongs to the vendor
    const ownsProduct = order.items.some(
      (item) => item.product && item.product.vendor && item.product.vendor.id === userId
    );
    if (!ownsProduct) {
      throw new ForbiddenException('You do not have permission to update this order');
    }
    order.status = newStatus;
    await this.orderRepository.save(order);
    return order;
  }

  async createMyProduct(userId: number, dto: CreateVendorProductDto) {
    // Create a new Product and associate with vendor
    const product = this.productRepository.create({
      ...dto,
      currency: dto.currency,
      vendor: { id: userId },
    });
    await this.productRepository.save(product);
    return product;
  }

  async deleteMyProduct(userId: number, productId: number) {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ['vendor'],
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.vendor.id !== userId) {
      throw new ForbiddenException('You do not have permission to delete this product');
    }
    await this.productRepository.delete(productId);
    return { success: true };
  }

  async findPublicVendors({ page = 1, limit = 20, search = '' }) {
    // Find users where roles array contains VENDOR
    const qb = this.userRepository.createQueryBuilder('user');
    qb.where('user.roles @> :roles', { roles: [UserRole.VENDOR] });
    if (search) {
      qb.andWhere('user.storeName ILIKE :search', { search: `%${search}%` });
    }
    qb.skip((page - 1) * limit).take(limit).orderBy('user.id', 'DESC');
    const [vendors, total] = await qb.getManyAndCount();
    return { data: vendors, total };
  }

  async getPublicProfile(userId: number) {
    // Find user with VENDOR role
    const user = await this.userRepository.createQueryBuilder('user')
      .where('user.id = :id', { id: userId })
      .andWhere(':role = ANY(user.roles)', { role: UserRole.VENDOR })
      .getOne();
    if (!user) return null;
    // Only expose safe fields
    const { id, storeName, avatarUrl, displayName, createdAt } = user;
    // TODO: Add rating logic if available
    return { id, storeName, avatarUrl, displayName, createdAt };
  }

  async getDashboardOverview(userId: number) {
    const [productCount, orderCount] = await Promise.all([
      this.productRepository.count({ where: { vendor: { id: userId } } }),
      // TODO: Implement order count logic
      Promise.resolve(0),
    ]);
    // TODO: Add sales stats logic
    return { productCount, orderCount };
  }

  async getVendorProducts(userId: number) {
    const products = await this.productRepository.find({ where: { vendor: { id: userId } } });
    return Array.isArray(products) ? products : [];
  }

  async updateMyProduct(userId: number, productId: number, dto: any) {
    const product = await this.productRepository.findOne({
      where: { id: productId, vendor: { id: userId } },
    });
    if (!product) throw new Error('Product not found or not owned by user');
    Object.assign(product, dto);
    return this.productRepository.save(product);
  }
}