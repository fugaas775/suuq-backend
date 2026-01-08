import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import {
  WalletTransaction,
  TransactionType,
} from '../wallet/entities/wallet-transaction.entity';
import { User, SubscriptionTier } from '../users/entities/user.entity';

@Injectable()
export class SubscriptionAnalyticsService {
  constructor(
    @InjectRepository(WalletTransaction)
    private readonly transactionRepo: Repository<WalletTransaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getAnalytics() {
    const mrr = await this.getCurrentMRR();
    const churn = await this.getChurnRate();
    const growth = await this.getGrowthTrend();
    const revenueByCurrency = await this.getRevenueByCurrency();

    return {
      mrr,
      churn,
      growth,
      revenueByCurrency,
    };
  }

  /**
   * Current MRR (USD): Sum of all SUBSCRIPTION and SUBSCRIPTION_RENEWAL transactions
   * in the last 30 days, converted to USD using the stored fxRate.
   */
  async getCurrentMRR(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.transactionRepo
      .createQueryBuilder('tx')
      .select('SUM(ABS(tx.amount) / NULLIF(tx.fxRate, 0))', 'mrr_usd')
      .where('tx.createdAt >= :date', { date: thirtyDaysAgo })
      .andWhere('tx.type IN (:...types)', {
        types: [
          TransactionType.SUBSCRIPTION,
          TransactionType.SUBSCRIPTION_RENEWAL,
        ],
      })
      // Note: We assume all transactions in this table are 'COMPLETED' as per system design.
      .getRawOne<{ mrr_usd: any }>();

    const mrr = result ? Number(result.mrr_usd) : 0;
    return Math.round(mrr * 100) / 100;
  }

  /**
   * Churn Rate: Percentage of failed renewals vs. successful ones over the last 30 days.
   * Since we don't store failed transactions in WalletTransaction, we infer churn
   * by looking at users who dropped from PRO to FREE in the last 30 days.
   */
  async getChurnRate(): Promise<{
    rate: number;
    churnedUsers: number;
    activeUsers: number;
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Active PRO users
    const activeUsers = await this.userRepo.count({
      where: { subscriptionTier: SubscriptionTier.PRO },
    });

    // Churned users: Currently FREE, but subscriptionExpiry was in the last 30 days
    // This implies they expired recently and didn't renew.
    const churnedUsers = await this.userRepo.count({
      where: {
        subscriptionTier: SubscriptionTier.FREE,
        subscriptionExpiry: Between(thirtyDaysAgo, new Date()),
      },
    });

    const total = activeUsers + churnedUsers;
    const rate = total > 0 ? (churnedUsers / total) * 100 : 0;

    return {
      rate: Math.round(rate * 100) / 100,
      churnedUsers,
      activeUsers,
    };
  }

  /**
   * Growth Trend: Month-over-month comparison of active Pro vendors.
   */
  async getGrowthTrend(): Promise<{
    current: number;
    previous: number;
    growthPercent: number;
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Current Active PRO Users
    const currentActive = await this.userRepo.count({
      where: { subscriptionTier: SubscriptionTier.PRO },
    });

    // To estimate previous active users (30 days ago):
    // Previous = Current - New + Churned

    // New Subscribers in last 30 days (Initial subscriptions)
    const newSubscribers = await this.transactionRepo.count({
      where: {
        type: TransactionType.SUBSCRIPTION,
        createdAt: MoreThanOrEqual(thirtyDaysAgo),
      },
    });

    // Churned in last 30 days (calculated in getChurnRate)
    const churnedUsers = await this.userRepo.count({
      where: {
        subscriptionTier: SubscriptionTier.FREE,
        subscriptionExpiry: Between(thirtyDaysAgo, new Date()),
      },
    });

    const previousActive = currentActive - newSubscribers + churnedUsers;

    const growthPercent =
      previousActive > 0
        ? ((currentActive - previousActive) / previousActive) * 100
        : 100; // If previous was 0, growth is 100% (or infinite)

    return {
      current: currentActive,
      previous: previousActive,
      growthPercent: Math.round(growthPercent * 100) / 100,
    };
  }

  /**
   * Revenue by Currency: Breakdown of how much is being paid in ETB, KES, SOS, and DJF.
   */
  async getRevenueByCurrency(): Promise<Record<string, number>> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.transactionRepo
      .createQueryBuilder('tx')
      .leftJoin('tx.wallet', 'wallet')
      .select('wallet.currency', 'currency')
      .addSelect('SUM(ABS(tx.amount))', 'total')
      .where('tx.createdAt >= :date', { date: thirtyDaysAgo })
      .andWhere('tx.type IN (:...types)', {
        types: [
          TransactionType.SUBSCRIPTION,
          TransactionType.SUBSCRIPTION_RENEWAL,
        ],
      })
      .groupBy('wallet.currency')
      .getRawMany<{ currency: string; total: string }>();

    const revenue: Record<string, number> = {};
    for (const row of result) {
      revenue[row.currency] = Number(row.total);
    }

    return revenue;
  }
}
