import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { RolesGuard } from '../auth/roles.guard';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';

// 1. Import the modules that provide the services you need
import { UsersModule } from '../users/users.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  // 2. Add UsersModule and OrdersModule here
  imports: [UsersModule, OrdersModule, WithdrawalsModule],
  controllers: [AdminController],
  // 3. Remove the services from providers. They are now correctly provided by the imported modules.
  providers: [RolesGuard], 
})
export class AdminModule {}