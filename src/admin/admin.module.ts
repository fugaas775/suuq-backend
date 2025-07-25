import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { RolesGuard } from '../auth/roles.guard';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { CartModule } from '../cart/cart.module';
import { MpesaModule } from '../mpesa/mpesa.module';
import { TelebirrModule } from '../telebirr/telebirr.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Order]), WithdrawalsModule, CartModule, MpesaModule, TelebirrModule, NotificationsModule],
  controllers: [AdminController],
  providers: [UsersService, OrdersService, RolesGuard],
})
export class AdminModule {}
