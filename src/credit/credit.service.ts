import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditLimit } from './entities/credit-limit.entity';
import {
  CreditTransaction,
  CreditTransactionType,
} from './entities/credit-transaction.entity';
import { CurrencyService } from '../common/services/currency.service';

@Injectable()
export class CreditService {
  constructor(
    @InjectRepository(CreditLimit)
    private creditLimitRepo: Repository<CreditLimit>,
    @InjectRepository(CreditTransaction)
    private transactionRepo: Repository<CreditTransaction>,
    private readonly currencyService: CurrencyService,
  ) {}

  async getLimit(userId: number) {
    const limit = await this.creditLimitRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!limit) {
      // Return default 0 limit
      const defaultCurrency = 'ETB';
      const zero = this.currencyService.formatAmount(0, defaultCurrency);
      return {
        maxLimit: zero,
        currentUsage: zero,
        available: zero,
        currency: defaultCurrency,
        isEligible: false,
      };
    }
    const available = Number(limit.maxLimit) - Number(limit.currentUsage);
    const currency = limit.currency || 'ETB';
    return {
      ...limit,
      maxLimit: this.currencyService.formatAmount(
        Number(limit.maxLimit),
        currency,
      ),
      currentUsage: this.currencyService.formatAmount(
        Number(limit.currentUsage),
        currency,
      ),
      available: this.currencyService.formatAmount(available, currency),
    };
  }

  async applyForCredit(userId: number) {
    // Placeholder for credit scoring logic
    // check credit score, history, etc.
    // For now, auto-approve small limit if not exists
    let limit = await this.creditLimitRepo.findOne({
      where: { user: { id: userId } },
    });
    if (limit) return limit;

    limit = this.creditLimitRepo.create({
      user: { id: userId } as any,
      maxLimit: 5000, // Default start limit
      isEligible: true,
      currency: 'ETB',
    });
    return this.creditLimitRepo.save(limit);
  }

  async useCredit(userId: number, amount: number, referenceId: string) {
    const limit = await this.creditLimitRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!limit || !limit.isActive || !limit.isEligible) {
      throw new BadRequestException('User not eligible for credit');
    }

    const available = Number(limit.maxLimit) - Number(limit.currentUsage);
    if (amount > available) {
      throw new BadRequestException('Insufficient credit limit');
    }

    // Update usage
    limit.currentUsage = Number(limit.currentUsage) + amount;
    await this.creditLimitRepo.save(limit);

    // Record transaction
    const tx = this.transactionRepo.create({
      user: { id: userId } as any,
      type: CreditTransactionType.USAGE,
      amount,
      referenceId,
      description: `Used credit for order ${referenceId}`,
    });
    await this.transactionRepo.save(tx);

    return tx;
  }

  async findAllLimits(
    page: number = 1,
    limit: number = 20,
    search?: string,
  ): Promise<{ data: any[]; total: number }> {
    const qb = this.creditLimitRepo
      .createQueryBuilder('cl')
      .leftJoinAndSelect('cl.user', 'user')
      .orderBy('cl.createdAt', 'DESC');

    if (search) {
      qb.andWhere(
        '(user.email ILIKE :search OR user.displayName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data: data.map((cl) => ({
        ...cl,
        user: {
          id: cl.user.id,
          email: cl.user.email,
          displayName: cl.user.displayName,
          avatarUrl: cl.user.avatarUrl,
        },
      })),
      total,
    };
  }

  async setLimit(userId: number, maxLimit: number) {
    let limit = await this.creditLimitRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!limit) {
      limit = this.creditLimitRepo.create({
        user: { id: userId } as any,
        maxLimit,
        currentUsage: 0,
        currency: 'ETB',
        isEligible: true,
        isActive: true,
      });
    } else {
      limit.maxLimit = maxLimit;
    }

    await this.creditLimitRepo.save(limit);
    // Reload to ensure consistent formatting (decimal columns return as strings from DB)
    return this.creditLimitRepo.findOne({ where: { user: { id: userId } } });
  }

  async repayCredit(userId: number, amount: number, notes?: string) {
    const limit = await this.creditLimitRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!limit) {
      throw new NotFoundException('Credit limit not found for user');
    }

    const currentUsageNumber = Number(limit.currentUsage);
    if (amount > currentUsageNumber) {
      throw new BadRequestException(
        `Repayment amount ${amount} exceeds current usage ${currentUsageNumber}`,
      );
    }

    limit.currentUsage = currentUsageNumber - amount;

    await this.creditLimitRepo.save(limit);

    const tx = this.transactionRepo.create({
      user: { id: userId } as any,
      type: CreditTransactionType.REPAYMENT,
      amount,
      description: notes || 'Manual repayment via Admin',
    });
    return this.transactionRepo.save(tx);
  }

  async getTransactions(userId: number) {
    return this.transactionRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteCreditLimit(userId: number) {
    const limit = await this.creditLimitRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!limit) {
      throw new NotFoundException('Credit limit not found for user');
    }

    if (Number(limit.currentUsage) > 0) {
      throw new BadRequestException(
        'Cannot delete credit limit while user has outstanding usage. Please repay first.',
      );
    }

    return this.creditLimitRepo.remove(limit);
  }
}
