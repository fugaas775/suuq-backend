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

@Module({
  imports: [TypeOrmModule.forFeature([WalletTransaction, User])],
  providers: [
    ThrottlingMetricsService,
    PrometheusService,
    SubscriptionAnalyticsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  controllers: [MetricsController, PrometheusController],
  exports: [
    ThrottlingMetricsService,
    PrometheusService,
    SubscriptionAnalyticsService,
  ],
})
export class MetricsModule {}
