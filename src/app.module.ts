import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { VendorDashboardModule } from './vendor-dashboard/vendor-dashboard.module';
import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { AdminDeliveriesModule } from './admin/deliveries/deliveries.module';
import { CategoriesModule } from './categories/categories.module';
import { MediaModule } from './media/media.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres', // ✅ required to avoid driver undefined
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      autoLoadEntities: true,
    }),
    UsersModule,
    AuthModule,
    ProductsModule,
    OrdersModule,
    DeliveriesModule,
    WithdrawalsModule,
    VendorDashboardModule,
    AdminDashboardModule,
    NotificationsModule,
    AdminModule,
    AdminDeliveriesModule,
    CategoriesModule,
    MediaModule,
    SettingsModule,
  ],
})
export class AppModule {}

