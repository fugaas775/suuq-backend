// src/app.module.ts
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD } from '@nestjs/core';
import { APP_INTERCEPTOR } from '@nestjs/core';
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
import { RedisModule } from './redis/redis.module';
import { RolesModule } from './roles/roles.module';
import { SearchModule } from './search/search.module';

import { EmailModule } from './email/email.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FavoritesModule } from './favorites/favorites.module';
import { HealthModule } from './health/health.module';
import { ModerationModule } from './moderation/moderation.module';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { FeatureFlagsModule } from './common/feature-flags/feature-flags.module';
import { ProductRequestsModule } from './product-requests/product-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRoot(dataSourceOptions), // Use the simplified, direct config
    // Global Cache (Redis if configured, else in-memory)
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        const ttl = parseInt(process.env.DEFAULT_CACHE_TTL_MS || '60000', 10);
        const url = process.env.REDIS_URL || '';
        if (url) {
          try {
            const { default: redisStore } = await import(
              'cache-manager-redis-yet'
            );
            return {
              store: redisStore as any,
              url,
              ttl,
              pingInterval: 10000,
              // Optionally namespace keys
              // prefix: 'suuq:',
            } as any;
          } catch (e) {
            console.warn(
              'Redis cache store unavailable, falling back to memory:',
              (e as Error)?.message,
            );
          }
        }
        return { ttl } as any;
      },
    }),
    // Global rate limiting with optional Redis storage for multi-instance deployments
    ThrottlerModule.forRootAsync({
      useFactory: async () => {
        const ttl = parseInt(process.env.THROTTLE_TTL ?? '', 10) || 60000;
        const limit = parseInt(process.env.THROTTLE_LIMIT ?? '', 10) || 180;

        // Attempt to use Redis-backed storage if configured
        const redisUrl = process.env.REDIS_URL;
        const redisHost = process.env.REDIS_HOST;
        const redisPort = process.env.REDIS_PORT
          ? parseInt(process.env.REDIS_PORT, 10)
          : undefined;
        const redisPassword = process.env.REDIS_PASSWORD;

        try {
          if (redisUrl || redisHost) {
            const { createClient } = await import('redis');
            const client = redisUrl
              ? createClient({ url: redisUrl })
              : createClient({
                  socket: {
                    host: redisHost,
                    port: redisPort || 6379,
                  },
                  password: redisPassword,
                });
            await client.connect();

            // Lightweight Redis storage implementation for throttler
            const storage = {
              async getRecord(key: string) {
                const v: unknown = await client.get(key as any);
                const s =
                  typeof v === 'string'
                    ? v
                    : v && (v as any).toString
                      ? (v as any).toString('utf8')
                      : undefined;
                return s ? JSON.parse(s) : []; // array of timestamps
              },
              async addRecord(key: string, ttlMs: number) {
                const now = Date.now();
                const expireAt = Math.ceil(ttlMs / 1000);
                const records = await this.getRecord(key);
                records.push(now);
                const filtered = records.filter(
                  (t: number) => now - t <= ttlMs,
                );
                await client.set(key, JSON.stringify(filtered), {
                  EX: expireAt,
                });
              },
            } as any;

            return [{ ttl, limit, storage }];
          }
        } catch (e) {
          console.warn(
            'Redis throttler storage unavailable, using in-memory. Error:',
            (e as Error).message,
          );
        }

        return [
          {
            ttl,
            limit,
          },
        ];
      },
    }),

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
    RedisModule,
    RolesModule,
    ModerationModule,
    FeatureFlagsModule,
    SearchModule,
    ProductRequestsModule,
  ],
  controllers: [AppController],
  // Apply rate limiting globally
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AdminThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class AppModule {}
