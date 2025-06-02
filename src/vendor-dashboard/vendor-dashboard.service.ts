import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { Order } from '../orders/order.entity';
import {
  Withdrawal,
  WithdrawalStatus,
} from '../withdrawals/entities/withdrawal.entity';

@Injectable()
export class VendorDashboardService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,

    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,

    @InjectRepository(Withdrawal)
    private readonly withdrawalRepo: Repository<Withdrawal>,
  ) {}

  async getStats(vendorId: number) {
    const [
      productCount,
      orderCount,
      totalQuantity,
      totalEarnings,
      totalWithdrawn,
      pendingWithdrawals,
      recentOrders,
      topProducts,
    ] = await Promise.all([
      this.productRepo.count({ where: { vendor: { id: vendorId } } }),

      this.orderRepo
        .createQueryBuilder('order')
        .innerJoin('order.product', 'product')
        .where('product.vendorId = :vendorId', { vendorId })
        .getCount(),

      this.orderRepo
        .createQueryBuilder('order')
        .innerJoin('order.product', 'product')
        .where('product.vendorId = :vendorId', { vendorId })
        .select('SUM(order.quantity)', 'total')
        .getRawOne()
        .then((res) => Number(res.total || 0)),

      this.orderRepo
        .createQueryBuilder('order')
        .innerJoin('order.product', 'product')
        .where('product.vendorId = :vendorId', { vendorId })
        .select('SUM(order.quantity * product.price)', 'revenue')
        .getRawOne()
        .then((res) => Number(res.revenue || 0)),

      this.withdrawalRepo.count({
        where: { vendor: { id: vendorId }, status: WithdrawalStatus.APPROVED },
      }),

      this.withdrawalRepo.count({
        where: { vendor: { id: vendorId }, status: WithdrawalStatus.PENDING },
      }),

      this.orderRepo.find({
        where: { product: { vendor: { id: vendorId } } },
        take: 5,
        order: { createdAt: 'DESC' },
        relations: ['product'],
      }),

      this.orderRepo
        .createQueryBuilder('order')
        .select('product.id', 'productId')
        .addSelect('product.name', 'productName')
        .addSelect('SUM(order.quantity)', 'totalSold')
        .innerJoin('order.product', 'product')
        .where('product.vendorId = :vendorId', { vendorId })
        .groupBy('product.id')
        .addGroupBy('product.name')
        .orderBy('"totalSold"', 'DESC') // ⬅ fix here
        .limit(5)
        .getRawMany(),
    ]);

    return {
      stats: {
        productCount,
        orderCount,
        totalQuantity,
        totalEarnings,
        totalWithdrawn,
        pendingWithdrawals,
      },
      recentOrders,
      topProducts,
    };
  }
}
