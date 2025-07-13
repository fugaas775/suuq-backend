import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Import all your feature modules
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
import { CountriesModule } from './countries/countries.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    
    // This now becomes the single source of truth for your running application
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        ssl: { rejectUnauthorized: false },
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_NAME'),
        autoLoadEntities: true, // Automatically loads all your @Entity() classes
        synchronize: false, // Never use true in production
      }),
    }),
    
    // List all your feature modules here
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
    CountriesModule,
  ],
  controllers: [AppController, ContentController, VendorPublicController],
  providers: [AppService, ContentService, VendorPublicService],
})
export class AppModule {}