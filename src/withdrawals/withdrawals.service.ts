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
import {
  PayoutProvider,
  PayoutStatus,
} from '../wallet/entities/payout-log.entity';
import { User } from '../users/entities/user.entity';
import { EmailService } from '../email/email.service';
import { EbirrService } from '../ebirr/ebirr.service';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  private emitWithdrawalOutcomeEvent(params: {
    outcome: 'APPROVED' | 'REJECTED';
    withdrawalId: number;
    userId: number;
    method: string;
    amount: number;
    status: WithdrawalStatus;
    providerReference?: string | null;
    reason?: string | null;
  }) {
    this.logger.log(
      `WITHDRAWAL_OUTCOME ${JSON.stringify({
        telemetryTag: 'WITHDRAWAL_OUTCOME',
        ...params,
        emittedAt: new Date().toISOString(),
      })}`,
    );
  }

  private emitWithdrawalApproveFailedEvent(params: {
    withdrawalId: number;
    userId: number;
    method: string;
    amount: number;
    providerReference?: string | null;
    failureReason: string;
  }) {
    this.logger.error(
      `WITHDRAWAL_APPROVE_FAILED ${JSON.stringify({
        telemetryTag: 'WITHDRAWAL_APPROVE_FAILED',
        ...params,
        emittedAt: new Date().toISOString(),
      })}`,
    );
  }

  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepository: Repository<Withdrawal>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly walletService: WalletService,
    private readonly emailService: EmailService,
    private readonly ebirrService: EbirrService,
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

    const normalizedMethod = String(method || '')
      .trim()
      .toUpperCase();
    if (!normalizedMethod) {
      throw new BadRequestException('Withdrawal method is required');
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
      method: normalizedMethod,
      details,
      status: WithdrawalStatus.PENDING,
    });

    const saved = await this.withdrawalRepository.save(withdrawal);

    // Send email
    this.emailService
      .sendWithdrawalRequested(user, amount, normalizedMethod, saved.id)
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
    const startedAt = Date.now();
    const take = query.limit || 20;
    const skip = ((query.page || 1) - 1) * take;

    if (query.userId) {
      const dbStartedAt = Date.now();
      const [items, total] = await this.withdrawalRepository.findAndCount({
        where: { user: { id: query.userId } },
        order: { createdAt: 'DESC' },
        take,
        skip,
      });
      const dbMs = Date.now() - dbStartedAt;
      const totalMs = Date.now() - startedAt;
      this.logger.log(
        `[findAll] self-withdrawals userId=${query.userId} count=${items.length} total=${total} dbMs=${dbMs} totalMs=${totalMs}`,
      );
      if (totalMs > 700) {
        this.logger.warn(
          `[findAll] Slow self-withdrawals userId=${query.userId} totalMs=${totalMs}`,
        );
      }
      return { items, total };
    }

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

    const dbStartedAt = Date.now();
    const [items, total] = await qb.getManyAndCount();
    const dbMs = Date.now() - dbStartedAt;

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

    const totalMs = Date.now() - startedAt;
    this.logger.log(
      `[findAll] admin-withdrawals count=${items.length} total=${total} dbMs=${dbMs} totalMs=${totalMs}`,
    );
    if (totalMs > 900) {
      this.logger.warn(`[findAll] Slow admin-withdrawals totalMs=${totalMs}`);
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

    const method = String(withdrawal.method || '')
      .trim()
      .toUpperCase();

    if (method === 'EBIRR') {
      const payoutPhone = String(
        withdrawal.details?.account_number ||
          withdrawal.details?.accountNo ||
          withdrawal.details?.phoneNumber ||
          withdrawal.user?.vendorPhoneNumber ||
          withdrawal.user?.phoneNumber ||
          '',
      ).trim();

      if (!payoutPhone) {
        throw new BadRequestException(
          'Cannot approve EBIRR withdrawal: payout phone/account is missing.',
        );
      }

      const referenceId = `WD-${withdrawal.id}-U-${withdrawal.user.id}`;

      try {
        const payoutResult = await this.ebirrService.sendPayout({
          phoneNumber: payoutPhone,
          amount: Number(withdrawal.amount),
          referenceId,
          remark: `Withdrawal #${withdrawal.id} approved`,
        });

        const providerReference =
          payoutResult?.data?.referenceId ||
          payoutResult?.data?.issuerTransactionId ||
          payoutResult?.data?.requestId ||
          referenceId;

        await this.walletService.debitWallet(
          withdrawal.user.id,
          withdrawal.amount,
          TransactionType.PAYOUT,
          `Withdrawal Approved via ${method}`,
        );

        withdrawal.status = WithdrawalStatus.APPROVED;
        withdrawal.method = method;
        withdrawal.details = {
          ...(withdrawal.details || {}),
          disbursementReference: String(providerReference),
          disbursedAt: new Date().toISOString(),
        };

        const saved = await this.withdrawalRepository.save(withdrawal);

        await this.walletService.logPayout({
          vendorId: withdrawal.user.id,
          amount: Number(withdrawal.amount),
          currency: 'ETB',
          phoneNumber: payoutPhone,
          provider: PayoutProvider.EBIRR,
          transactionReference: String(providerReference),
          status: PayoutStatus.SUCCESS,
        });

        this.emailService
          .sendWithdrawalApproved(
            withdrawal.user,
            Number(withdrawal.amount),
            method,
            saved.id,
          )
          .catch((e) =>
            this.logger.error(
              `Failed to send withdrawal approval email: ${e.message}`,
            ),
          );

        this.emitWithdrawalOutcomeEvent({
          outcome: 'APPROVED',
          withdrawalId: saved.id,
          userId: withdrawal.user.id,
          method,
          amount: Number(withdrawal.amount),
          status: saved.status,
          providerReference: String(providerReference),
          reason: null,
        });

        return saved;
      } catch (error: any) {
        this.emitWithdrawalApproveFailedEvent({
          withdrawalId: withdrawal.id,
          userId: withdrawal.user.id,
          method,
          amount: Number(withdrawal.amount),
          providerReference: referenceId,
          failureReason:
            error?.message || 'EBIRR withdrawal disbursement failed',
        });

        await this.walletService.logPayout({
          vendorId: withdrawal.user.id,
          amount: Number(withdrawal.amount),
          currency: 'ETB',
          phoneNumber: payoutPhone,
          provider: PayoutProvider.EBIRR,
          transactionReference: referenceId,
          status: PayoutStatus.FAILED,
          failureReason:
            error?.message || 'EBIRR withdrawal disbursement failed',
        });

        throw new BadRequestException(
          `EBIRR disbursement failed: ${error?.message || 'Unknown error'}`,
        );
      }
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

    this.emitWithdrawalOutcomeEvent({
      outcome: 'APPROVED',
      withdrawalId: saved.id,
      userId: withdrawal.user.id,
      method,
      amount: Number(withdrawal.amount),
      status: saved.status,
      providerReference: saved.details?.disbursementReference || null,
      reason: null,
    });

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
    withdrawal.details = {
      ...(withdrawal.details || {}),
      rejectedAt: new Date().toISOString(),
      rejectedReason: reason || null,
    };
    const saved = await this.withdrawalRepository.save(withdrawal);

    // IMPORTANT: Withdrawal requests do not debit/reserve wallet balance at creation time.
    // Therefore, rejecting a pending withdrawal must NOT credit wallet, otherwise balance is inflated.

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

    this.emitWithdrawalOutcomeEvent({
      outcome: 'REJECTED',
      withdrawalId: saved.id,
      userId: withdrawal.user.id,
      method: String(withdrawal.method || '')
        .trim()
        .toUpperCase(),
      amount: Number(withdrawal.amount),
      status: saved.status,
      providerReference: saved.details?.disbursementReference || null,
      reason: reason || null,
    });

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
        id: 'EBIRR',
        name: 'Ebirr',
        enabled: true,
        currencies: ['ETB'],
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
