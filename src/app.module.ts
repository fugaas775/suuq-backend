// src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config'; // Keep this as AppDataSource uses process.env

// Import your application modules
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
import { SeedsModule } from './seeds/seeds.module';

// Import AppDataSource
import { AppDataSource } from './data-source'; // Adjust path if necessary

// You no longer need these imports for TypeOrmModule.forRoot's entities array:
// import { Product } from './products/entities/product.entity';
// import { Category } from './categories/category.entity';
// import { User } from './users/user.entity';
// import { MediaEntity } from './media/media.entity';
// import { Tag } from './tags/tag.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env', // This ensures .env is loaded for the whole app
    }),
    TypeOrmModule.forRootAsync({
      // useFactory will be called to get the TypeORM options
      useFactory: () => AppDataSource.options,
      // If AppDataSource needed to be initialized before providing options (e.g., for subscribers or complex setup),
      // you could use dataSourceFactory, but for providing options, useFactory is simpler.
      // dataSourceFactory: async () => {
      //   if (!AppDataSource.isInitialized) {
      //     await AppDataSource.initialize();
      //   }
      //   return AppDataSource;
      // }
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
    SeedsModule,
  ],
})
export class AppModule {}
