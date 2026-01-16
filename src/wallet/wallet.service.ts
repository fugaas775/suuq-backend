import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  EntityManager,
  Between,
  MoreThan,
} from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import {
  WalletTransaction,
  TransactionType,
} from './entities/wallet-transaction.entity';
import { TopUpRequest, TopUpStatus } from './entities/top-up-request.entity';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { User, SubscriptionTier } from '../users/entities/user.entity';
import { CurrencyService } from '../common/services/currency.service';
import { UsersService } from '../users/users.service';

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
    @InjectRepository(UiSetting)
    private readonly uiSettingRepository: Repository<UiSetting>,
    private readonly dataSource: DataSource,
    private readonly currencyService: CurrencyService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async getWallet(userId: number, requestedCurrency?: string): Promise<Wallet> {
    let wallet = await this.walletRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // If a specific currency is requested and it's different from user's current preference, update it
    if (requestedCurrency && user.currency !== requestedCurrency) {
      console.log(
        `[WalletService] Updating user ${userId} currency preference from ${user.currency} to ${requestedCurrency}`,
      );
      user.currency = requestedCurrency;
      await this.userRepository.save(user);
    }

    if (!wallet) {
      // Determine currency based on user preference or location
      let currency = user.currency || 'KES'; // Default to user preference if set

      if (!user.currency) {
        if (user.registrationCountry === 'ET') currency = 'ETB';
        else if (user.registrationCountry === 'DJ') currency = 'DJF';
        else if (user.registrationCountry === 'SO') currency = 'SOS';
        else if (user.registrationCountry === 'KE') currency = 'KES';
      }

      console.log(
        `[WalletService] Creating new wallet for user ${userId} with currency ${currency}`,
      );
      wallet = this.walletRepository.create({
        user,
        balance: 0,
        currency,
      });
      try {
        await this.walletRepository.save(wallet);
      } catch (err) {
        // Handle race condition: wallet might have been created by another process
        if (err.code === '23505') {
          wallet = await this.walletRepository.findOne({
            where: { user: { id: userId } },
            relations: ['user'],
          });
          if (!wallet) throw err; // Should not happen if it was a duplicate key error
        } else {
          throw err;
        }
      }
    } else {
      // Sync currency if user preference changed
      if (user.currency && wallet.currency !== user.currency) {
        console.log(
          `[WalletService] Migrating wallet ${wallet.id} from ${wallet.currency} to ${user.currency}`,
        );
        await this.migrateWalletCurrency(wallet, user.currency);
        // Reload wallet after migration
        wallet = await this.walletRepository.findOne({
          where: { id: wallet.id },
          relations: ['user'],
        });
      } else {
        // Recalculate balance to ensure integrity
        await this.recalculateBalance(wallet.id);
        // Reload wallet after recalculation
        wallet = await this.walletRepository.findOne({
          where: { id: wallet.id },
          relations: ['user'],
        });
      }
    }

    return wallet;
  }

  async recalculateBalance(walletId: number): Promise<void> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
    });
    if (!wallet) return;

    const transactions = await this.transactionRepository.find({
      where: { wallet: { id: walletId } },
    });

    let totalBalance = 0;

    for (const tx of transactions) {
      // Assuming transactions are stored in the currency they were made in?
      // Or are they stored in wallet currency at the time?
      // The schema doesn't have a currency column on transaction, only amount and fxRate.
      // This implies amount is already in wallet currency OR we need to know the source currency.
      // However, if we are migrating wallet currency, we might need to re-convert past transactions?
      // That's dangerous without knowing original currency.
      // BUT, the prompt says: "If you find transactions in different currencies..."
      // Since we don't store currency on transaction, we can't know if they are different.
      // We must assume the amount is in the wallet's currency.
      // Wait, if we change wallet currency from KES to ETB, the old KES amounts (e.g. 2000) become 2000 ETB? That's wrong value.
      // We need to convert the balance.
      // Since we don't have transaction currency history, the best we can do is convert the *current balance* once during migration,
      // OR assume all past transactions were in the *old* currency and convert them.

      // Let's look at `syncWalletCurrency`. It changes currency then calls recalculate.
      // If we just sum, we get wrong value.
      // We should probably convert the *balance* during sync, not just change label.

      // However, the prompt says: "Update the recalculateBalance method. If transactions exist in a different currency... use CurrencyService to convert".
      // Since `WalletTransaction` entity doesn't have `currency`, I cannot fulfill "If transactions exist in a different currency" literally from the entity.
      // I will assume the prompt implies that if I am changing the wallet currency, I should handle the conversion.

      // Actually, `WalletTransaction` has `fxRate`.
      // Let's stick to the prompt's "Strict Currency Hard-Sync" in `getWallet`.
      // If I change `wallet.currency` there, I should also convert the balance or transactions.
      // But `recalculateBalance` sums transactions. If I change wallet currency, the sum will be the same number but different currency (wrong value).

      // STRATEGY:
      // 1. In `getWallet`, if we detect a currency change (User vs Wallet), we calculate the conversion rate.
      // 2. We update `wallet.currency`.
      // 3. We should ideally update all past transactions to the new currency? Or just the balance?
      // If `recalculateBalance` is called on every get, we MUST update transactions.
      // Otherwise `recalculateBalance` will revert the converted balance to the old sum.

      // So, in `syncWalletCurrency` (and `getWallet` migration logic), we must convert all transaction amounts.

      totalBalance += Number(tx.amount);
    }

    // This method just sums. The conversion logic should be in the migration step.
    // But the prompt explicitly asked to "Update the recalculateBalance method... convert...".
    // This implies I should check something.
    // Maybe I should assume the transactions are in the *old* currency if I am in the middle of migration?
    // No, `recalculateBalance` is stateless.

    // Let's look at the `getWallet` logic I wrote.
    // `if (user.currency && wallet.currency !== user.currency)` -> `wallet.currency = user.currency; save; recalculate;`
    // This is dangerous if I don't convert amounts.

    // I will modify `getWallet` to call a smart migration method instead of just setting property.

    const balance = totalBalance;
    const roundedBalance = Math.round(balance * 100) / 100;
    await this.walletRepository.update(walletId, { balance: roundedBalance });
  }

  async creditWallet(
    userId: number,
    amount: number,
    type: TransactionType,
    description?: string,
    orderId?: number,
    externalManager?: EntityManager,
  ): Promise<WalletTransaction> {
    const run = async (manager: EntityManager) => {
      let wallet = await manager.findOne(Wallet, {
        where: { user: { id: userId } },
      });
      if (!wallet) {
        // Create if not exists (lazy load logic handled in getWallet, but we need it inside transaction here)
        // For simplicity, we assume getWallet handled creation before, or we fail.
        // But better to create on the fly if user receives money.
        const user = await manager.findOne(User, { where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');
        
        let currency = user.currency;
        if (!currency) {
            // Default heuristics
            if (user.registrationCountry === 'ET') currency = 'ETB';
            else if (user.registrationCountry === 'DJ') currency = 'DJF';
            else if (user.registrationCountry === 'SO') currency = 'SOS';
            else currency = 'KES';
        }
        
        wallet = manager.create(Wallet, {
            user,
            balance: 0,
            currency
        });
        wallet = await manager.save(wallet);
      }

      const tx = manager.create(WalletTransaction, {
        wallet,
        amount: Math.abs(amount), // Credit is positive
        type,
        description,
        orderId,
      });

      await manager.save(tx);
      
      wallet.balance = Number(wallet.balance) + Number(amount);
      await manager.save(wallet);

      return tx;
    };

    if (externalManager) return run(externalManager);
    return this.dataSource.transaction(run);
  }

  async debitWallet(
    userId: number,
    amount: number,
    type: TransactionType,
    description?: string,
    orderId?: number,
    externalManager?: EntityManager,
  ): Promise<WalletTransaction> {
    const run = async (manager: EntityManager) => {
      const wallet = await manager.findOne(Wallet, {
        where: { user: { id: userId } },
        lock: { mode: 'pessimistic_write' }, // Lock for safety
      });

      if (!wallet) throw new NotFoundException('Wallet not found');

      if (Number(wallet.balance) < Number(amount)) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const tx = manager.create(WalletTransaction, {
        wallet,
        amount: -Math.abs(amount), // Debit is negative
        type,
        description,
        orderId,
      });

      await manager.save(tx);

      wallet.balance = Number(wallet.balance) - Number(amount);
      await manager.save(wallet);

      return tx;
    };

    if (externalManager) return run(externalManager);
    return this.dataSource.transaction(run);
  }

  private async migrateWalletCurrency(wallet: Wallet, targetCurrency: string) {
    if (wallet.currency === targetCurrency) return;

    const oldCurrency = wallet.currency || 'KES';
    // Rate is handled inside convert if needed or implicit

    // We need to update ALL transactions for this wallet to the new currency.
    const transactions = await this.transactionRepository.find({
      where: { wallet: { id: wallet.id } },
    });

    for (const tx of transactions) {
      const newAmount = this.currencyService.convert(
        Number(tx.amount),
        oldCurrency,
        targetCurrency,
      );
      tx.amount = newAmount;
      await this.transactionRepository.save(tx);
    }

    wallet.currency = targetCurrency;
    await this.walletRepository.save(wallet);

    // Now recalculate will sum the new amounts
    await this.recalculateBalance(wallet.id);
  }

  async getTransactions(userId: number): Promise<WalletTransaction[]> {
    const wallet = await this.getWallet(userId);
    return this.transactionRepository.find({
      where: { wallet: { id: wallet.id } },
      order: { createdAt: 'DESC' },
    });
  }



  async requestTopUp(
    userId: number,
    amount: number,
    method: string,
    reference?: string,
    metadata?: Record<string, any>,
    attachmentUrl?: string,
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
      attachmentUrl,
      status: TopUpStatus.PENDING,
      metadata: metadata || {},
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

  async getWalletStats() {
    const totalTransactions = await this.transactionRepository.count();

    // Replaced Active Subscriptions with Certified Vendors count
    const certifiedVendors = await this.userRepository.count({
      where: {
        verified: true,
      },
    });

    const revenueResult = await this.transactionRepository
      .createQueryBuilder('tx')
      .select('SUM(tx.amount)', 'total')
      .where('tx.type IN (:...types)', {
        types: [
          TransactionType.SUBSCRIPTION, // include legacy subs
          TransactionType.COMMISSION, // if we track commission as tx
          // Note: Commission is currently calculated on OrderItem and might not be a WalletTransaction yet
          // unless we create one. For now, this just tracks wallet movement.
        ],
      })
      .getRawOne();
      
    // Ideally we should also sum order_item.commission for "Collected Commission"
    // But this method seems to be about Wallet Transactions specifically.
    // Let's repurpose "activeSubscriptions" to "certifiedVendors"

    return {
      totalTransactions,
      activeSubscriptions: certifiedVendors, // Aliased for frontend compatibility
      certifiedVendors,
      revenue: Number(revenueResult?.total) || 0,
    };
  }


  async findAllTransactions(
    page: number = 1,
    limit: number = 20,
    type?: TransactionType,
    orderId?: number,
    userId?: number,
    startDate?: string,
    endDate?: string,
  ): Promise<{ data: any[]; total: number; page: number; pages: number }> {
    const where: any = {};
    if (type) where.type = type;
    if (orderId) where.orderId = orderId;
    if (userId) where.wallet = { user: { id: userId } };
    if (startDate && endDate) {
      where.createdAt = Between(new Date(startDate), new Date(endDate));
    } else if (startDate) {
      where.createdAt = MoreThan(new Date(startDate));
    }

    const [transactions, total] = await this.transactionRepository.findAndCount(
      {
        where,
        relations: ['wallet', 'wallet.user'],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      },
    );

    // Map the result to flatten the structure for the frontend

    const data = transactions.map((tx: WalletTransaction) => ({
      ...tx,

      user: tx.wallet?.user,

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
        description: null, // Let client localize "Top-up via..." based on type DEPOSIT and method
      });
      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();
      
      // Post-transaction auto-action: Check for pending auto-subscriptions
      // This handles cases where user previously tried to subscribe but had insufficient funds.
      this.usersService.processPendingWalletSubscription(request.user.id).catch(err => {
        console.error(`Error processing pending subscription after top-up: ${err.message}`);
      });
      
      // Also process explicit metadata-based auto-actions (legacy support)
      await this.processAutoAction(request, walletEntity);
      
      return request;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private async processAutoAction(request: TopUpRequest, wallet: Wallet): Promise<void> {
    if (request.metadata && request.metadata.auto_action === 'upgrade_pro') {
      console.log(`[AutoAction] Processing auto-upgrade for user ${request.user.id}`);
      try {
        // 1. Get Price
        const setting = await this.uiSettingRepository.findOne({ where: { key: 'vendor_subscription_base_price' } });
        
        if (!setting) {
            console.warn('[AutoAction] vendor_subscription_base_price not set in DB. Upgrade aborted.');
            return;
        }

        const rawPrice = Number(setting.value); 
        const priceCurrency = 'USD';
        
        // 2. Convert to Wallet Currency
        const walletCurrency = wallet.currency || 'KES'; // Default if missing
        
        const convertedPrice = this.currencyService.convert(rawPrice, priceCurrency, walletCurrency);
        const finalPrice = Math.ceil(convertedPrice); // Round up to be safe/clean

        console.log(`[AutoAction] Price: ${rawPrice} ${priceCurrency} -> ${finalPrice} ${walletCurrency}`);

        // 3. Check Balance
        if (Number(wallet.balance) >= finalPrice) {
          // 4. Deduct
          await this.debitWallet(request.user.id, finalPrice, TransactionType.SUBSCRIPTION, 'Pro Plan Upgrade (Auto)');
          
          // 5. Update User Subscription
          const user = await this.userRepository.findOne({ where: { id: request.user.id } });
          if (user) {
            user.subscriptionTier = SubscriptionTier.PRO;
            // Set expiry to 30 days from now
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 30);
            user.subscriptionExpiry = expiry;
            await this.userRepository.save(user);
            console.log(`[AutoAction] User ${user.id} upgraded to PRO automatically.`);
          }
        } else {
          console.warn(`[AutoAction] Insufficient balance for auto-upgrade. Req: ${finalPrice} ${walletCurrency}, Has: ${wallet.balance}`);
        }
      } catch (e) {
        console.error('[AutoAction] Failed to auto-upgrade:', e);
      }
    }
  }

  async rejectTopUp(requestId: number): Promise<TopUpRequest> {
    const request = await this.topUpRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Top-up request not found');
    }

    if (request.status !== TopUpStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    request.status = TopUpStatus.REJECTED;
    return this.topUpRequestRepository.save(request);
  }

  async payWithWallet(
    userId: number,
    amount: number,
    description: string,
    type: TransactionType = TransactionType.PAYMENT,
    fxRate?: number,
    checkCurrency?: string, // Optional: Enforce currency match
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

      // Log currency check
      console.log(
        `[PayWithWallet] Wallet Currency: ${wallet.currency}, Amount: ${amount}, CheckCurrency: ${checkCurrency}`,
      );

      if (checkCurrency && wallet.currency !== checkCurrency) {
        throw new BadRequestException(
          `Currency mismatch: Wallet is ${wallet.currency}, Payment is ${checkCurrency}`,
        );
      }

      if (Number(wallet.balance) < amount) {
        throw new BadRequestException(
          `Insufficient funds. Balance: ${wallet.balance} ${wallet.currency}, Required: ${amount}`,
        );
      }

      // Round to 2 decimal places
      const newBalance = Number(wallet.balance) - amount;
      wallet.balance = Math.round(newBalance * 100) / 100;

      await queryRunner.manager.save(wallet);

      const transaction = this.transactionRepository.create({
        wallet,
        type,
        amount: -amount,
        description,
        fxRate,
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

  async syncWalletCurrency(userId: number): Promise<Wallet> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    let wallet = await this.walletRepository.findOne({
      where: { user: { id: userId } },
    });
    if (!wallet) {
      return this.getWallet(userId); // Will create with correct currency
    }

    if (user.currency && wallet.currency !== user.currency) {
      await this.migrateWalletCurrency(wallet, user.currency);
      // Reload
      wallet = await this.walletRepository.findOne({
        where: { id: wallet.id },
      });
    }
    return wallet;
  }
}
