import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CreateVendorProductDto } from './dto/create-vendor-product.dto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { ProductImage } from '../products/entities/product-image.entity'; // <-- 1. IMPORT ADDED
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
    // ✨ 2. REPOSITORY INJECTED
    @InjectRepository(ProductImage)
    private readonly productImageRepository: Repository<ProductImage>,
  ) {}

  async getSalesGraph(userId: number, query: any) {
    // ... (Your existing code is preserved)
    return {
      range: query.range || '30d',
      data: [
        { date: '2025-07-01', sales: 10 },
        { date: '2025-07-02', sales: 12 },
        { date: '2025-07-03', sales: 8 },
      ]
    };
  }

  async updateOrderStatus(userId: number, orderId: number, newStatus: OrderStatus) {
    // ... (Your existing code is preserved)
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['items', 'items.product', 'items.product.vendor'],
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
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

  // ✨ 3. THIS FUNCTION IS NOW FIXED
  async createMyProduct(userId: number, dto: CreateVendorProductDto): Promise<Product> {
    const vendor = await this.userRepository.findOneBy({ id: userId });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${userId} not found.`);
    }

    const { images, ...productData } = dto;

    const newProduct = this.productRepository.create({
      ...productData,
      vendor: vendor,
      price: Number(productData.price) || 0,
    });
    
    const savedProduct = await this.productRepository.save(newProduct);

    if (images && Array.isArray(images) && images.length > 0) {
      const imageEntities = images.map((imageUrl) =>
        this.productImageRepository.create({
          src: imageUrl,
          product: savedProduct,
        }),
      );
      await this.productImageRepository.save(imageEntities);
    }
    
    return this.productRepository.findOneOrFail({
        where: { id: savedProduct.id },
        relations: ['images', 'vendor', 'category', 'tags']
    });
  }

  async deleteMyProduct(userId: number, productId: number) {
    // ... (Your existing code is preserved)
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
    // ... (Your existing code is preserved)
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
    // ... (Your existing code is preserved)
    const user = await this.userRepository.createQueryBuilder('user')
      .where('user.id = :id', { id: userId })
      .andWhere(':role = ANY(user.roles)', { role: UserRole.VENDOR })
      .getOne();
    if (!user) return null;
    const { id, storeName, avatarUrl, displayName, createdAt } = user;
    return { id, storeName, avatarUrl, displayName, createdAt };
  }

  async getDashboardOverview(userId: number) {
    // ... (Your existing code is preserved)
    const [productCount, orderCount] = await Promise.all([
      this.productRepository.count({ where: { vendor: { id: userId } } }),
      Promise.resolve(0),
    ]);
    return { productCount, orderCount };
  }

  async getVendorProducts(userId: number) {
    // ... (Your existing code is preserved)
    const products = await this.productRepository.find({ where: { vendor: { id: userId } } });
    return Array.isArray(products) ? products : [];
  }

  async updateMyProduct(userId: number, productId: number, dto: any) {
    // ... (Your existing code is preserved)
    const product = await this.productRepository.findOne({
      where: { id: productId, vendor: { id: userId } },
    });
    if (!product) throw new Error('Product not found or not owned by user');
    Object.assign(product, dto);
    return this.productRepository.save(product);
  }
}