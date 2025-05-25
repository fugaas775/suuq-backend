import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Withdrawal, WithdrawalStatus } from './entities/withdrawal.entity';
import { User } from '../users/user.entity';

@Injectable()
export class WithdrawalsService {
  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepo: Repository<Withdrawal>,
  ) {}

  async getVendorWithdrawals(vendorId: number) {
  const withdrawals = await this.withdrawalRepo.find({
    where: { vendor: { id: vendorId } },
    order: { createdAt: 'DESC' },
  });

  const [approved, pending, rejected] = await Promise.all([
    this.withdrawalRepo.count({
      where: { vendor: { id: vendorId }, status: WithdrawalStatus.APPROVED },
    }),
    this.withdrawalRepo.count({
      where: { vendor: { id: vendorId }, status: WithdrawalStatus.PENDING },
    }),
    this.withdrawalRepo.count({
      where: { vendor: { id: vendorId }, status: WithdrawalStatus.REJECTED },
    }),
  ]);

  return {
    withdrawals,
    summary: {
      totalRequested: withdrawals.length,
      approved,
      pending,
      rejected,
    },
   };
 }

  async updateStatus(id: number, status: WithdrawalStatus) {
    const withdrawal = await this.withdrawalRepo.findOne({ where: { id } });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    withdrawal.status = status;
    return this.withdrawalRepo.save(withdrawal);
  }

  async createWithdrawal(amount: number, mobileMoneyNumber: string, vendorId: number) {
   const withdrawal = this.withdrawalRepo.create({
    amount,
    mobileMoneyNumber,
    vendor: { id: vendorId } as User,
    status: WithdrawalStatus.PENDING,
    });

   return this.withdrawalRepo.save(withdrawal);
  }

  async getAll() {
   return this.withdrawalRepo.find({
     relations: ['vendor'],
     order: { createdAt: 'DESC' },
   });
  }

  async getVendorStats(vendorId: number) {
   const totalApproved = await this.withdrawalRepo
    .createQueryBuilder('withdrawal')
    .select('SUM(withdrawal.amount)', 'total')
    .where('withdrawal.vendorId = :vendorId', { vendorId })
    .andWhere('withdrawal.status = :status', { status: WithdrawalStatus.APPROVED })
    .getRawOne();

  const pendingCount = await this.withdrawalRepo.count({
    where: { vendor: { id: vendorId }, status: WithdrawalStatus.PENDING },
  });

  return {
     totalWithdrawn: parseFloat(totalApproved.total || 0),
     pendingRequests: pendingCount,
    };
  }


}
