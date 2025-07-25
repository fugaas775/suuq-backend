import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Withdrawal, WithdrawalStatus } from './entities/withdrawal.entity';
import { User } from '../users/entities/user.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class WithdrawalsService {
  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepository: Repository<Withdrawal>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async calculateVendorBalance(userId: number): Promise<number> {
    // Total DELIVERED order value for vendor
    const deliveredOrders = await this.orderRepository.createQueryBuilder('order')
      .leftJoin('order.items', 'item')
      .where('item.product.vendorId = :userId', { userId })
      .andWhere('order.status = :status', { status: OrderStatus.DELIVERED })
      .select('SUM(item.price * item.quantity)', 'total')
      .getRawOne();
    const totalDelivered = Number(deliveredOrders.total) || 0;

    // Total APPROVED withdrawals
    const approvedWithdrawals = await this.withdrawalRepository.createQueryBuilder('withdrawal')
      .where('withdrawal.vendorId = :userId', { userId })
      .andWhere('withdrawal.status = :status', { status: WithdrawalStatus.APPROVED })
      .select('SUM(withdrawal.amount)', 'total')
      .getRawOne();
    const totalWithdrawn = Number(approvedWithdrawals.total) || 0;

    return totalDelivered - totalWithdrawn;
  }

  async requestWithdrawal(userId: number, amount: number): Promise<Withdrawal> {
    const balance = await this.calculateVendorBalance(userId);
    if (amount > balance) {
      throw new BadRequestException('Requested amount exceeds available balance');
    }
    const withdrawal = this.withdrawalRepository.create({
      amount,
      vendor: { id: userId } as User,
      status: WithdrawalStatus.PENDING,
    });
    return this.withdrawalRepository.save(withdrawal);
  }

  async getWithdrawalsForVendor(userId: number): Promise<Withdrawal[]> {
    return this.withdrawalRepository.find({ where: { vendor: { id: userId } }, order: { createdAt: 'DESC' } });
  }

  async approveWithdrawal(withdrawalId: number): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepository.findOne({ where: { id: withdrawalId } });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    withdrawal.status = WithdrawalStatus.APPROVED;
    const saved = await this.withdrawalRepository.save(withdrawal);
    // Send notification to vendor
    await this.notificationsService.sendToUser({
      userId: withdrawal.vendor?.id,
      title: 'Withdrawal Approved',
      body: `Your withdrawal request #${withdrawalId} has been approved.`,
    });
    return saved;
  }

  async rejectWithdrawal(withdrawalId: number): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepository.findOne({ where: { id: withdrawalId } });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    withdrawal.status = WithdrawalStatus.REJECTED;
    return this.withdrawalRepository.save(withdrawal);
  }

  async getAllWithdrawals(status?: WithdrawalStatus): Promise<Withdrawal[]> {
    const where = status ? { status } : {};
    return this.withdrawalRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  async countPendingWithdrawals(): Promise<number> {
    return this.withdrawalRepository.count({ 
      where: { status: WithdrawalStatus.PENDING } 
    });
  }
}
