// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AdminThrottlerGuard } from './common/guards/admin-throttler.guard';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { dataSourceOptions } from './ormconfig';

// Import all your feature modules
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { DelivererModule } from './deliverer/deliverer.module';
import { CategoriesModule } from './categories/categories.module';
import { SettingsModule } from './settings/settings.module';
import { TagModule } from './tags/tag.module';
import { CartModule } from './cart/cart.module';
import { VendorModule } from './vendor/vendor.module';
import { CountriesModule } from './countries/countries.module';
import { MpesaModule } from './mpesa/mpesa.module';
import { PaymentsModule } from './payments/payments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FirebaseModule } from './firebase/firebase.module';
import { MediaModule } from './media/media.module';
import { VerificationModule } from './verification/verification.module';
import { AdminModule } from './admin/admin.module';
import { HomeModule } from './home/home.module';
import { CurationModule } from './curation/curation.module';
import { MetricsModule } from './metrics/metrics.module';

import { EmailModule } from './email/email.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FavoritesModule } from './favorites/favorites.module';
import { HealthModule } from './health/health.module';
// import { ModerationModule } from './moderation/moderation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRoot(dataSourceOptions), // Use the simplified, direct config
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL, 10) || 60000, // 1 minute default
        limit: parseInt(process.env.THROTTLE_LIMIT, 10) || 60, // 60 requests per minute default
      },
    ]),

    // List all your feature modules
    UsersModule,
    AuthModule,
    ProductsModule,
    EmailModule,
    OrdersModule,
    DelivererModule,
    CategoriesModule,
    SettingsModule,
    TagModule,
    VendorModule,
    CartModule,
    CountriesModule,
    MpesaModule,
    PaymentsModule,
    ReviewsModule,
    NotificationsModule,
    FirebaseModule,
    MediaModule,
    VerificationModule,
    AdminModule,
    HomeModule,
    CurationModule,
    FavoritesModule,
  MetricsModule,
  HealthModule,
  // ModerationModule,
  ],
  controllers: [AppController],
  // Apply rate limiting globally
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AdminThrottlerGuard,
    },
  ],
})
export class AppModule {}
