import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlingMetricsService } from './throttling-metrics.service';
import { MetricsController } from './metrics.controller';
import { PrometheusService } from './prometheus.service';
import { PrometheusController } from './prometheus.controller';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { SubscriptionAnalyticsService } from './subscription-analytics.service';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity';
import { User } from '../users/entities/user.entity';
import { FeedInteraction } from './entities/feed-interaction.entity';
import { FeedInteractionService } from './feed-interaction.service';
import { MetricsV2Controller } from './metrics-v2.controller';
import { Product } from '../products/entities/product.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WalletTransaction,
      User,
      FeedInteraction,
      Product,
    ]),
  ],
  providers: [
    ThrottlingMetricsService,
    PrometheusService,
    SubscriptionAnalyticsService,
    FeedInteractionService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  controllers: [MetricsController, PrometheusController, MetricsV2Controller],
  exports: [
    ThrottlingMetricsService,
    PrometheusService,
    SubscriptionAnalyticsService,
    FeedInteractionService,
  ],
})
export class MetricsModule {}
