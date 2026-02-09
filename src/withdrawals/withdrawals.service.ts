import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Withdrawal, WithdrawalStatus } from './entities/withdrawal.entity';
import { WalletService } from '../wallet/wallet.service';
import { Wallet } from '../wallet/entities/wallet.entity';
import { TransactionType } from '../wallet/entities/wallet-transaction.entity';
import { User } from '../users/entities/user.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepository: Repository<Withdrawal>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly walletService: WalletService,
    private readonly emailService: EmailService,
  ) {}

  async requestWithdrawal(
    user: User,
    amount: number,
    method: string,
    details: any,
  ): Promise<Withdrawal> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    // if (method === 'TELEBIRR' && !user.telebirrVerified) {
    //     throw new BadRequestException('Telebirr account not verified');
    // }

    // Ensure funds are available before creating the request (do not debit yet)
    const wallet = await this.walletService.getWallet(user.id);
    if (Number(wallet.balance) < Number(amount)) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const withdrawal = this.withdrawalRepository.create({
      user,
      amount,
      method,
      details,
      status: WithdrawalStatus.PENDING,
    });

    const saved = await this.withdrawalRepository.save(withdrawal);

    // Send email
    this.emailService
      .sendWithdrawalRequested(user, amount, method, saved.id)
      .catch((e) =>
        this.logger.error(
          `Failed to send withdrawal request email: ${e.message}`,
        ),
      );

    return saved;
  }

  async deleteWithdrawal(id: number) {
    const result = await this.withdrawalRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException('Withdrawal not found');
    }
    return { deleted: 1 };
  }

  async deleteWithdrawals(ids: number[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('ids array is required');
    }
    const result = await this.withdrawalRepository.delete(ids);
    return { deleted: result.affected || 0 };
  }

  async findAll(query: {
    userId?: number;
    status?: WithdrawalStatus;
    limit?: number;
    page?: number;
  }) {
    const take = query.limit || 20;
    const skip = ((query.page || 1) - 1) * take;

    const qb = this.withdrawalRepository
      .createQueryBuilder('withdrawal')
      .leftJoinAndSelect('withdrawal.user', 'user')
      .orderBy('withdrawal.createdAt', 'DESC')
      .take(take)
      .skip(skip);

    if (query.userId) {
      qb.andWhere('withdrawal.user.id = :userId', { userId: query.userId });
    }
    if (query.status) {
      qb.andWhere('withdrawal.status = :status', { status: query.status });
    }

    const [items, total] = await qb.getManyAndCount();

    // Manually fetch and map wallet balances to ensure reliability
    const userIds = [
      ...new Set(items.map((item) => item.user?.id).filter(Boolean)),
    ];

    if (userIds.length > 0) {
      const wallets = await this.walletRepository.find({
        where: { user: { id: In(userIds) } },
        relations: ['user'],
      });

      const walletMap = new Map<number, number>();
      wallets.forEach((w) => {
        walletMap.set(w.user.id, Number(w.balance || 0));
      });

      items.forEach((item) => {
        if (item.user && walletMap.has(item.user.id)) {
          item.user.walletBalance = walletMap.get(item.user.id);
          // Also attach wallet object as frontend might check that too

          (item.user as any).wallet = { balance: item.user.walletBalance };
        }
      });
    }

    return { items, total };
  }

  async approveWithdrawal(id: number): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepository.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException('Withdrawal is not pending');
    }

    // Debit wallet now (on approval) so the transaction appears when funds are truly released
    await this.walletService.debitWallet(
      withdrawal.user.id,
      withdrawal.amount,
      TransactionType.PAYOUT,
      `Withdrawal Approved via ${withdrawal.method}`,
    );

    withdrawal.status = WithdrawalStatus.APPROVED;

    const saved = await this.withdrawalRepository.save(withdrawal);

    this.emailService
      .sendWithdrawalApproved(
        withdrawal.user,
        Number(withdrawal.amount),
        withdrawal.method,
        saved.id,
      )
      .catch((e) =>
        this.logger.error(
          `Failed to send withdrawal approval email: ${e.message}`,
        ),
      );

    return saved;
  }

  async rejectWithdrawal(id: number, reason?: string): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepository.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException('Withdrawal is not pending');
    }

    withdrawal.status = WithdrawalStatus.REJECTED;
    const saved = await this.withdrawalRepository.save(withdrawal);

    // Refund the money
    await this.walletService.creditWallet(
      withdrawal.user.id,
      Number(withdrawal.amount),
      TransactionType.REFUND,
      `Refund: Withdrawal #${id} Rejected. ${reason || ''}`,
    );

    this.emailService
      .sendWithdrawalRejected(
        withdrawal.user,
        Number(withdrawal.amount),
        withdrawal.method,
        saved.id,
        reason,
      )
      .catch((e) =>
        this.logger.error(
          `Failed to send withdrawal rejection email: ${e.message}`,
        ),
      );

    return saved;
  }

  getPayoutMethods(currency?: string) {
    // Return static list for now, can be enhanced to filter by currency
    const methods = [
      {
        id: 'BANK_TRANSFER',
        name: 'Bank Transfer',
        enabled: true,
        currencies: ['ETB', 'USD'],
      },
      {
        id: 'TELEBIRR',
        name: 'Telebirr',
        enabled: true,
        currencies: ['ETB'],
      },
    ];

    if (currency) {
      return methods.filter((m) => m.currencies.includes(currency));
    }
    return methods;
  }
}
