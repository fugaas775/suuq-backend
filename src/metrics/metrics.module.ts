import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlingMetricsService } from './throttling-metrics.service';
import { MetricsController } from './metrics.controller';
import { PrometheusService } from './prometheus.service';
import { PrometheusController } from './prometheus.controller';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

@Module({
  providers: [
    ThrottlingMetricsService,
    PrometheusService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  controllers: [MetricsController, PrometheusController],
  exports: [ThrottlingMetricsService, PrometheusService],
})
export class MetricsModule {}
