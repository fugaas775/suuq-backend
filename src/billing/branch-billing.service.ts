import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { POS_WORKSPACE_REFERENCE_PREFIX } from '../branch-staff/pos-workspace-activation.service';
import { BranchExpense } from './entities/branch-expense.entity';

export interface OwnerBranchBilling {
  branchId: number;
  branchName: string;
  serviceFormat: string | null;
  subscription: {
    period: string | null;
    status: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    autoRenew: boolean;
    amountTotal: number | null;
    currency: string | null;
  } | null;
  lastPayment: {
    referenceId: string;
    amount: number;
    currency: string | null;
    status: string;
    paidAt: Date;
  } | null;
  nextRenewalAt: Date | null;
}

@Injectable()
export class BranchBillingService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionsRepo: Repository<TenantSubscription>,
    @InjectRepository(EbirrTransaction)
    private readonly ebirrRepo: Repository<EbirrTransaction>,
    @InjectRepository(BranchExpense)
    private readonly expensesRepo: Repository<BranchExpense>,
  ) {}

  /** Return per-branch billing summary for branches owned by the user. */
  async listOwnerBranches(userId: number): Promise<OwnerBranchBilling[]> {
    const branches = await this.branchesRepo.find({
      where: { ownerId: userId, isActive: true } as any,
      order: { name: 'ASC' },
    });
    if (!branches.length) return [];

    const branchIds = branches.map((b) => b.id);
    const subs = await this.subscriptionsRepo.find({
      where: { branchId: In(branchIds) } as any,
      order: { createdAt: 'DESC' },
    });
    const subByBranch = new Map<number, TenantSubscription>();
    for (const s of subs) {
      if (s.branchId == null) continue;
      if (!subByBranch.has(s.branchId)) subByBranch.set(s.branchId, s);
    }

    const lastPaymentByBranch =
      await this.findLastPaymentsForBranches(branchIds);

    return branches.map((branch) => {
      const sub = subByBranch.get(branch.id) || null;
      const meta = (sub?.metadata as any) || {};
      return {
        branchId: branch.id,
        branchName: branch.name,
        serviceFormat: (branch as any).serviceFormat ?? null,
        subscription: sub
          ? {
              period:
                (meta.subscriptionPeriod as string) ||
                (sub as any).billingInterval ||
                null,
              status: sub.status,
              startsAt: sub.startsAt ?? null,
              endsAt: sub.endsAt ?? null,
              autoRenew: Boolean(sub.autoRenew),
              amountTotal:
                sub.amountTotal != null ? Number(sub.amountTotal) : null,
              currency: sub.currency ?? null,
            }
          : null,
        lastPayment: lastPaymentByBranch.get(branch.id) || null,
        nextRenewalAt: sub?.endsAt ?? null,
      };
    });
  }

  async assertBranchOwnedBy(branchId: number, userId: number): Promise<Branch> {
    const branch = await this.branchesRepo.findOne({
      where: { id: branchId } as any,
    });
    if (!branch) throw new NotFoundException(`Branch #${branchId} not found.`);
    if (branch.ownerId !== userId) {
      throw new ForbiddenException('You do not own this branch.');
    }
    return branch;
  }

  /** Return Ebirr ledger entries scoped to a branch's POS activation refs. */
  async listBranchPayments(branchId: number) {
    const prefix = `${POS_WORKSPACE_REFERENCE_PREFIX}-${branchId}-`;
    const rows = await this.ebirrRepo
      .createQueryBuilder('e')
      .where('e.merch_order_id LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('e.created_at', 'DESC')
      .getMany();
    return rows.map((row) => ({
      id: row.id,
      referenceId: row.merch_order_id,
      status: row.status,
      amount: Number(row.amount),
      currency: row.currency || 'ETB',
      payerAccount: row.payer_account || null,
      transactionId: row.trans_id || null,
      issuerTransactionId: row.issuer_trans_id || null,
      requestTimestamp: row.request_timestamp || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getPaymentForReceipt(branchId: number, paymentId: number) {
    const prefix = `${POS_WORKSPACE_REFERENCE_PREFIX}-${branchId}-`;
    const row = await this.ebirrRepo.findOne({ where: { id: paymentId } });
    if (!row) throw new NotFoundException(`Payment #${paymentId} not found.`);
    if (!row.merch_order_id.startsWith(prefix)) {
      throw new ForbiddenException(
        'Payment does not belong to the requested branch.',
      );
    }
    return row;
  }

  async listBranchExpenses(
    branchId: number,
    range: { from?: Date; to?: Date } = {},
  ) {
    const where: any = { branchId };
    if (range.from && range.to) {
      where.occurredAt = Between(range.from, range.to);
    }
    return this.expensesRepo.find({ where, order: { occurredAt: 'DESC' } });
  }

  async createBranchExpense(
    branchId: number,
    userId: number,
    dto: {
      category: string;
      amount: number;
      currency?: string;
      occurredAt?: Date;
      note?: string;
    },
  ): Promise<BranchExpense> {
    const expense = this.expensesRepo.create({
      branchId,
      category: dto.category as any,
      amount: dto.amount,
      currency: dto.currency || 'ETB',
      occurredAt: dto.occurredAt || new Date(),
      note: dto.note ?? null,
      recordedByUserId: userId,
    });
    return this.expensesRepo.save(expense);
  }

  async deleteBranchExpense(
    branchId: number,
    expenseId: number,
  ): Promise<void> {
    const expense = await this.expensesRepo.findOne({
      where: { id: expenseId, branchId },
    });
    if (!expense) {
      throw new NotFoundException(
        `Expense #${expenseId} not found for branch #${branchId}.`,
      );
    }
    await this.expensesRepo.remove(expense);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async findLastPaymentsForBranches(
    branchIds: number[],
  ): Promise<Map<number, OwnerBranchBilling['lastPayment']>> {
    const result = new Map<number, OwnerBranchBilling['lastPayment']>();
    if (!branchIds.length) return result;

    for (const branchId of branchIds) {
      const prefix = `${POS_WORKSPACE_REFERENCE_PREFIX}-${branchId}-`;
      const row = await this.ebirrRepo
        .createQueryBuilder('e')
        .where('e.merch_order_id LIKE :prefix', { prefix: `${prefix}%` })
        .andWhere(`e.status IN ('SUCCESS', 'APPROVED')`)
        .orderBy('e.created_at', 'DESC')
        .limit(1)
        .getOne();
      if (row) {
        result.set(branchId, {
          referenceId: row.merch_order_id,
          amount: Number(row.amount),
          currency: row.currency || 'ETB',
          status: row.status,
          paidAt: row.created_at,
        });
      }
    }
    return result;
  }
}
