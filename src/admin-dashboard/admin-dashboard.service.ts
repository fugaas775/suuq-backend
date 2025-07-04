import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository, ArrayContains, DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { Withdrawal } from '../withdrawals/entities/withdrawal.entity';
import { UserRole } from '../auth/roles.enum'; // Unified enum import

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepo: Repository<Withdrawal>,
    private readonly dataSource: DataSource,
  ) {}

  async getSummary({ from, to }: { from?: string; to?: string }) {
    // Debug: log loaded entities
    this.logger.debug('Entities loaded: ' + this.dataSource.entityMetadatas.map(e => e.name).join(', '));

    const dateFilter = from && to ? {
      createdAt: Between(new Date(from), new Date(to + 'T23:59:59')),
    } : {};

    const [
      totalvendors,
      totalcustomers,
      totalorders,
      revenueResult,
      withdrawalResult,
    ] = await Promise.all([
      this.userRepo.count({ where: { roles: ArrayContains([UserRole.VENDOR]) } }),
      this.userRepo.count({ where: { roles: ArrayContains([UserRole.CUSTOMER]) } }),
      this.orderRepo.count({ where: dateFilter as any }),
      this.orderRepo
        .createQueryBuilder('order')
        .leftJoin('order.product', 'product')
        .where(dateFilter as any) 
        .select('SUM(order.quantity * product.price)', 'revenue')
        .getRawOne(),
      this.withdrawalRepo
        .createQueryBuilder('w')
        .where('w.status = :status', { status: 'APPROVED' })
        .andWhere(dateFilter.createdAt ? 'w."createdAt" BETWEEN :from AND :to' : '1=1', {
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to + 'T23:59:59') : undefined,
        })
        .select('SUM(w.amount)', 'total')
        .getRawOne(),
    ]);

    const totalrevenue = Number(revenueResult?.revenue || 0);
    const totalwithdrawals = Number(withdrawalResult?.total || 0);

    return {
      totalvendors,
      totalcustomers,
      totalorders,
      totalrevenue,
      totalwithdrawals,
    };
  }

  async getAnalytics({ from, to }: { from?: string; to?: string }) {
    // Debug: log loaded entities
    this.logger.debug('Entities loaded: ' + this.dataSource.entityMetadatas.map(e => e.name).join(', '));

    const dateFilter = from && to ? {
      createdAt: Between(new Date(from), new Date(to + 'T23:59:59')),
    } : {};

    const usersPerDay = await this.userRepo
      .createQueryBuilder('user')
      .select([
        `DATE_TRUNC('day', user.createdAt) as date`,
        'COUNT(*)::int as count'
      ])
      .where(dateFilter as any)
      .groupBy(`date`)
      .orderBy(`date`, 'ASC')
      .getRawMany();

    const ordersPerDay = await this.orderRepo
      .createQueryBuilder('order')
      .select([
        `DATE_TRUNC('day', order.createdAt) as date`,
        'COUNT(*)::int as count'
      ])
      .where(dateFilter as any)
      .groupBy(`date`)
      .orderBy(`date`, 'ASC')
      .getRawMany();

    const revenueResult = await this.orderRepo
      .createQueryBuilder('order')
      .leftJoin('order.product', 'product')
      .where(dateFilter as any)
      .select('SUM(order.quantity * product.price)', 'revenue')
      .getRawOne();

    const withdrawalResult = await this.withdrawalRepo
      .createQueryBuilder('w')
      .where('w.status = :status', { status: 'APPROVED' })
      .andWhere(dateFilter.createdAt ? 'w."createdAt" BETWEEN :from AND :to' : '1=1', {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to + 'T23:59:59') : undefined,
      })
      .select('SUM(w.amount)', 'total')
      .getRawOne();

    return {
      usersPerDay,
      ordersPerDay,
      totalRevenue: Number(revenueResult?.revenue || 0),
      totalWithdrawals: Number(withdrawalResult?.total || 0),
    };
  }
}