// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

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
import { CategoriesModule } from './categories/categories.module';
import { MediaModule } from './media/media.module';
import { SettingsModule } from './settings/settings.module';
import { SeedsModule } from './seeds/seeds.module';
import { ContentController } from './content/content.controller';
import { ContentService } from './content/content.service';
import { TagModule } from './tags/tag.module';
import { CartModule } from './cart/cart.module';
import { VendorPublicModule } from './vendor-public/vendor-public.module';
import { VendorPublicController } from './vendor-public/vendor-public.controller';
import { VendorPublicService } from './vendor-public/vendor-public.service';
import { VendorModule } from './vendor/vendor.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // FIX: Replaced the old useFactory with a standard async factory
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        // This setting tells TypeORM to automatically find all files named *.entity.ts
        autoLoadEntities: true, 
        // synchronize should always be false for production apps that use migrations
        synchronize: false,
      }),
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
    CategoriesModule,
    MediaModule,
    SettingsModule,
    SeedsModule,
    TagModule,
    VendorPublicModule,
    VendorModule,
    CartModule,
  ],
  controllers: [ContentController, VendorPublicController],
  providers: [ContentService, VendorPublicService],
})
export class AppModule {}