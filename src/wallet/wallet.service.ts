import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import {
  WalletTransaction,
  TransactionType,
} from './entities/wallet-transaction.entity';
import { Withdrawal, WithdrawalStatus } from '../withdrawals/entities/withdrawal.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepository: Repository<Withdrawal>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async getWallet(userId: number): Promise<Wallet> {
    let wallet = await this.walletRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!wallet) {
      // Create wallet if it doesn't exist
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      wallet = this.walletRepository.create({
        user,
        balance: 0,
      });
      await this.walletRepository.save(wallet);
    }

    return wallet;
  }

  async getTransactions(userId: number): Promise<WalletTransaction[]> {
    const wallet = await this.getWallet(userId);
    return this.transactionRepository.find({
      where: { wallet: { id: wallet.id } },
      order: { createdAt: 'DESC' },
    });
  }

  async requestPayout(user: User, amount: number): Promise<Withdrawal> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await this.walletRepository.findOne({
        where: { user: { id: user.id } },
        lock: { mode: 'pessimistic_write' }, // Lock wallet row
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (Number(wallet.balance) < amount) {
        throw new BadRequestException('Insufficient funds');
      }

      // 1. Deduct from Wallet
      wallet.balance = Number(wallet.balance) - amount;
      await queryRunner.manager.save(wallet);

      // 2. Create Transaction Record
      const transaction = this.transactionRepository.create({
        wallet,
        type: TransactionType.PAYOUT,
        amount: -amount,
        description: 'Payout Request',
      });
      await queryRunner.manager.save(transaction);

      // 3. Create Withdrawal Request (for Admin approval)
      const withdrawal = this.withdrawalRepository.create({
        vendor: user, // Using 'vendor' field as per existing entity, assuming it applies to Deliverers too or we need to update Withdrawal entity
        amount: amount,
        status: WithdrawalStatus.PENDING,
      });
      const savedWithdrawal = await queryRunner.manager.save(withdrawal);

      await queryRunner.commitTransaction();
      return savedWithdrawal;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // Helper to credit wallet (to be used by OrderService)
  async creditWallet(
    userId: number,
    amount: number,
    type: TransactionType,
    orderId?: number,
    description?: string,
  ): Promise<void> {
    const wallet = await this.getWallet(userId);
    wallet.balance = Number(wallet.balance) + amount;
    await this.walletRepository.save(wallet);

    const transaction = this.transactionRepository.create({
      wallet,
      type,
      amount,
      orderId,
      description,
    });
    await this.transactionRepository.save(transaction);
  }
}
