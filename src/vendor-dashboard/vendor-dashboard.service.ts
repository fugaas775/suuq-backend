import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { Order } from '../orders/entities/order.entity';
import { Withdrawal, WithdrawalStatus } from '../withdrawals/entities/withdrawal.entity';
import { Vendor } from '../vendor/entities/vendor.entity';
import { subDays, subMonths, startOfDay } from 'date-fns';

@Injectable()
export class VendorDashboardService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepo: Repository<Withdrawal>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
  ) {}

  async getOverviewStats(vendorId: number) {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
    const [
      productCount,
      orderCount,
      totalQuantity,
      totalEarnings,
      totalWithdrawn,
      pendingWithdrawals,
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
        .then((res) => Number(res?.total || 0)),
      this.orderRepo
        .createQueryBuilder('order')
        .innerJoin('order.product', 'product')
        .where('product.vendorId = :vendorId', { vendorId })
        .select('SUM(order.quantity * product.price)', 'revenue')
        .getRawOne()
        .then((res) => Number(res?.revenue || 0)),
      this.withdrawalRepo
        .createQueryBuilder('withdrawal')
        .select('SUM(withdrawal.amount)', 'withdrawn')
        .where('withdrawal.vendorId = :vendorId', { vendorId })
        .andWhere('withdrawal.status = :status', { status: WithdrawalStatus.APPROVED })
        .getRawOne()
        .then((res) => Number(res?.withdrawn || 0)),
      this.withdrawalRepo.count({
        where: { vendor: { id: vendorId }, status: WithdrawalStatus.PENDING },
      }),
    ]);
    return {
      productCount,
      orderCount,
      totalQuantity,
      totalEarnings,
      totalWithdrawn,
      pendingWithdrawals,
      vendorProfile: vendor && {
        store_name: vendor.store_name,
        legal_name: vendor.legal_name,
        registration_country: vendor.registration_country,
        registration_region: vendor.registration_region,
        registration_city: vendor.registration_city,
        business_type: vendor.business_type,
        phone_number: vendor.phone_number,
        email: vendor.email,
        website: vendor.website,
        address: vendor.address,
        verified: vendor.verified,
        is_active: vendor.is_active,
        featured: vendor.featured,
        rating: vendor.rating,
        number_of_sales: vendor.number_of_sales,
        years_on_platform: vendor.years_on_platform,
        last_login_at: vendor.last_login_at,
        // any other fields you wish to show to the vendor in the dashboard
      },
    };
  }

  async getRecentOrders(vendorId: number, limit: number = 5) {
    return this.orderRepo.find({
      where: { product: { vendor: { id: vendorId } } },
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['product'],
    });
  }

  async getTopProducts(vendorId: number, limit: number = 5) {
    const topProducts = await this.orderRepo
      .createQueryBuilder('order')
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('SUM(order.quantity)', 'totalSold')
      .innerJoin('order.product', 'product')
      .where('product.vendorId = :vendorId', { vendorId })
      .groupBy('product.id')
      .addGroupBy('product.name')
      .orderBy('totalSold', 'DESC')
      .limit(limit)
      .getRawMany();

    return topProducts.map((p) => ({
      productId: Number(p.productId),
      productName: p.productName,
      totalSold: Number(p.totalSold),
    }));
  }

  async getWithdrawals(vendorId: number, limit: number = 10) {
    return this.withdrawalRepo.find({
      where: { vendor: { id: vendorId } },
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async getVendorProducts(vendorId: number, query: any) {
    const take = Number(query.limit) || 10;
    const status = query.status;
    const where: any = { vendor: { id: vendorId } };
    if (status) where.stock_status = status;
    return this.productRepo.find({
      where,
      take,
      order: { createdAt: 'DESC' },
    });
  }

  async getSalesGraph(vendorId: number, range: string = '30d') {
    // Example: range = '30d', '7d', or '12m'
    let fromDate: Date;
    if (range.endsWith('d')) {
      fromDate = subDays(new Date(), parseInt(range));
    } else if (range.endsWith('m')) {
      fromDate = subMonths(new Date(), parseInt(range));
    } else {
      fromDate = subDays(new Date(), 30);
    }
    // Group by day for now (could be by month for '12m')
    const orders = await this.orderRepo
      .createQueryBuilder('order')
      .innerJoin('order.product', 'product')
      .where('product.vendorId = :vendorId', { vendorId })
      .andWhere('order.createdAt >= :fromDate', { fromDate: startOfDay(fromDate) })
      .select([
        "DATE(order.createdAt) as date",
        "SUM(order.quantity * product.price) as totalSales",
      ])
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    return orders.map(o => ({
      date: o.date,
      totalSales: Number(o.totalSales),
    }));
  }
}