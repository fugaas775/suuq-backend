import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Withdrawal, WithdrawalStatus } from './entities/withdrawal.entity';
import { WalletService } from '../wallet/wallet.service';
import { TransactionType } from '../wallet/entities/wallet-transaction.entity';
import { User } from '../users/entities/user.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepository: Repository<Withdrawal>,
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

    if (method === 'TELEBIRR' && !user.telebirrVerified) {
        throw new BadRequestException('Telebirr account not verified');
    }

    // Debit wallet immediately to lock funds
    await this.walletService.debitWallet(
        user.id,
        amount,
        TransactionType.PAYOUT,
        `Withdrawal Request via ${method}`
    );

    const withdrawal = this.withdrawalRepository.create({
      user,
      amount,
      method,
      details,
      status: WithdrawalStatus.PENDING,
    });

    const saved = await this.withdrawalRepository.save(withdrawal);
    
    // Send email
    this.emailService.sendWithdrawalRequested(user, amount, method, saved.id)
        .catch(e => this.logger.error(`Failed to send withdrawal request email: ${e.message}`));

    return saved;
  }

  async findAll(query: { userId?: number; status?: WithdrawalStatus; limit?: number; page?: number }) {
    const take = query.limit || 20;
    const skip = ((query.page || 1) - 1) * take;
    
    const qb = this.withdrawalRepository.createQueryBuilder('withdrawal')
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
    return { items, total };
  }

  async approveWithdrawal(id: number): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepository.findOne({ where: { id }, relations: ['user'] });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    
    if (withdrawal.status !== WithdrawalStatus.PENDING) {
        throw new BadRequestException('Withdrawal is not pending');
    }

    withdrawal.status = WithdrawalStatus.APPROVED;
    // Money was already debited. We just confirm.
    
    const saved = await this.withdrawalRepository.save(withdrawal);

    this.emailService.sendWithdrawalApproved(withdrawal.user, Number(withdrawal.amount), withdrawal.method, saved.id)
        .catch(e => this.logger.error(`Failed to send withdrawal approval email: ${e.message}`));

    return saved;
  }

  async rejectWithdrawal(id: number, reason?: string): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepository.findOne({ where: { id }, relations: ['user'] });
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
        `Refund: Withdrawal #${id} Rejected. ${reason || ''}`
    );

    this.emailService.sendWithdrawalRejected(withdrawal.user, Number(withdrawal.amount), withdrawal.method, saved.id, reason)
        .catch(e => this.logger.error(`Failed to send withdrawal rejection email: ${e.message}`));

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
