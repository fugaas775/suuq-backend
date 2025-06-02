import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { User } from '../users/user.entity';
import { Order } from '../orders/order.entity';
import { Withdrawal } from '../withdrawals/entities/withdrawal.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Order, Withdrawal]), // ✅ Import UserRepository here
  ],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class AdminDashboardModule {}
