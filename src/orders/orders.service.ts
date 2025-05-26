import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from './order.entity';
import { Product } from '../products/entities/product.entity';

@Injectable()
export class OrdersService {
 constructor(
   @InjectRepository(Order)
   private orderRepo: Repository<Order>,

   @InjectRepository(Product)
   private productRepo: Repository<Product>, // ✅ Add this
   ) {}
 

  async create(data: Partial<Order>) {
    const order = this.orderRepo.create(data);
    return this.orderRepo.save(order);
  }

  async findByCustomerEmail(email: string) {
  return this.orderRepo.find({
    where: { customerEmail: email },
    order: { createdAt: 'DESC' },
   });
  }

  async findByVendorId(vendorId: number) {
  const raw = await this.orderRepo.query(`
    SELECT o.*
    FROM "order" o
    JOIN "product" p ON o."productId" = p.id
    WHERE p."vendorId" = $1
    ORDER BY o."createdAt" DESC
  `, [vendorId]);

   return raw;
  }

  async getVendorEarnings(vendorId: number) {
  const result = await this.orderRepo.query(`
    SELECT
      COUNT(o.id) AS totalOrders,
      SUM(o.quantity) AS totalQuantity,
      SUM(o.quantity * p.price) AS totalRevenue
    FROM "order" o
    JOIN "product" p ON o."productId" = p.id
    WHERE p."vendorId" = $1
  `, [vendorId]);

  return result[0]; // return single row
  }
 
 async findOneByRole(orderId: number, user: any) {
  const order = await this.orderRepo.findOneBy({ id: orderId });
  if (!order) throw new NotFoundException('Order not found');

  if (user.role === 'CUSTOMER' && order.customerEmail !== user.email) {
    throw new ForbiddenException('Not your order');
  }

  if (user.role === 'VENDOR') {
    const product = await this.productRepo.findOne({
      where: { id: order.productId },
      relations: ['vendor'],
    });

    if (!product || product.vendor.id !== user.id) {
      throw new ForbiddenException('Not your product');
    }
  }

  return order;
 }

  async getAdminSalesSummary(from?: string, to?: string) {
  const params = [];
  let where = '';

  if (from && to) {
    where = `WHERE o."createdAt" BETWEEN $1 AND $2`;
    params.push(from, to);
    }

  const result = await this.orderRepo.query(`
    SELECT
      COUNT(o.id) AS totalOrders,
      COUNT(DISTINCT o."customerEmail") AS totalCustomers,
      SUM(o.quantity * p.price) AS totalRevenue
    FROM "order" o
    JOIN "product" p ON o."productId" = p.id
    ${where}
  `, params);

    return result[0];
  }


  async getTopProducts(user: any) {
  const isAdmin = user.role === 'ADMIN';
  const params = [];
  let whereClause = '';

  if (!isAdmin) {
    whereClause = 'WHERE p."vendorId" = $1';
    params.push(user.id);
    }

  const result = await this.orderRepo.query(`
    SELECT 
      p.id,
      p.name,
      SUM(o.quantity) AS totalSold
    FROM "order" o
    JOIN "product" p ON o."productId" = p.id
    ${whereClause}
    GROUP BY p.id, p.name
    ORDER BY totalSold DESC
    LIMIT 3
  `, params);

    return result;
  }

  async updateStatus(id: number, status: OrderStatus, user: any) {
   const order = await this.orderRepo.findOne({ 
     where: { id }, 
     relations: ['product', 'product.vendor'],
   });

   if (!order) {
     throw new NotFoundException('Order not found');
    }

   if (user.role === 'VENDOR' && order.product.vendor.id !== user.id) {
     throw new ForbiddenException('You do not own this order');
    }

   order.status = status;
   return this.orderRepo.save(order);
  }

  
  async getVendorOrders(vendorId: number, status?: OrderStatus, from?: string, to?: string) {
    const query = this.orderRepo.createQueryBuilder('order')
     .innerJoin('order.product', 'product')
     .where('product.vendorId = :vendorId', { vendorId });

   if (status) {
     query.andWhere('order.status = :status', { status });
   }

   if (from) {
     query.andWhere('order.createdAt >= :from', { from });
   }

   if (to) {
    if (to.length ===10) {
      to += 'T23:59:59';
      }
    query.andWhere('order.createdAt <= :to', { to });
    }

   return query.getMany();
  }

  

  async getCustomerOrders(email: string, status?: OrderStatus) {
  const query = this.orderRepo.createQueryBuilder('order')
    .where('order.customerEmail = :email', { email });

  if (status) {
    query.andWhere('order.status = :status', { status });
   }

  return query.getMany();
 }



}

