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
import { TopUpRequest, TopUpStatus } from './entities/top-up-request.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    @InjectRepository(TopUpRequest)
    private readonly topUpRequestRepository: Repository<TopUpRequest>,
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

  async requestTopUp(
    userId: number,
    amount: number,
    method: string,
    reference: string,
  ): Promise<TopUpRequest> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const topUpRequest = this.topUpRequestRepository.create({
      user,
      amount,
      method,
      reference,
      status: TopUpStatus.PENDING,
    });

    return this.topUpRequestRepository.save(topUpRequest);
  }

  async findAllTopUpRequests(
    page: number = 1,
    limit: number = 20,
    status?: TopUpStatus,
  ): Promise<{
    data: TopUpRequest[];
    total: number;
    page: number;
    pages: number;
  }> {
    const query = this.topUpRequestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.user', 'user')
      .orderBy('request.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) {
      query.where('request.status = :status', { status });
    }

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async findAllTransactions(
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: any[]; total: number; page: number; pages: number }> {
    const [transactions, total] = await this.transactionRepository.findAndCount(
      {
        relations: ['wallet', 'wallet.user'],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      },
    );

    // Map the result to flatten the structure for the frontend
    const data = transactions.map((tx) => ({
      ...tx,
      user: tx.wallet?.user, // Expose user directly on the transaction object
      userId: tx.wallet?.user?.id,
    }));

    return {
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }
  async deleteTransaction(id: number): Promise<void> {
    const result = await this.transactionRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }
  }

  async bulkDeleteTransactions(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await this.transactionRepository.delete(ids);
  }
  async approveTopUp(requestId: number): Promise<TopUpRequest> {
    const request = await this.topUpRequestRepository.findOne({
      where: { id: requestId },
      relations: ['user'],
    });

    if (!request) {
      throw new NotFoundException('Top-up request not found');
    }

    if (request.status !== TopUpStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      request.status = TopUpStatus.APPROVED;
      await queryRunner.manager.save(request);

      let walletEntity = await queryRunner.manager.findOne(Wallet, {
        where: { user: { id: request.user.id } },
        lock: { mode: 'pessimistic_write' },
      });

      if (!walletEntity) {
        walletEntity = this.walletRepository.create({
          user: request.user,
          balance: 0,
        });
        await queryRunner.manager.save(walletEntity);
      }

      walletEntity.balance =
        Number(walletEntity.balance) + Number(request.amount);
      await queryRunner.manager.save(walletEntity);

      const transaction = this.transactionRepository.create({
        wallet: walletEntity,
        type: TransactionType.DEPOSIT,
        amount: request.amount,
        description: `Top-up via ${request.method} (Ref: ${request.reference})`,
      });
      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();
      return request;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async payWithWallet(
    userId: number,
    amount: number,
    description: string,
  ): Promise<WalletTransaction> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { user: { id: userId } },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (Number(wallet.balance) < amount) {
        throw new BadRequestException('Insufficient funds');
      }

      wallet.balance = Number(wallet.balance) - amount;
      await queryRunner.manager.save(wallet);

      const transaction = this.transactionRepository.create({
        wallet,
        type: TransactionType.PAYMENT,
        amount: -amount,
        description,
      });
      const savedTransaction = await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();
      return savedTransaction;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
