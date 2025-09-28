import { Module } from '@nestjs/common';
import { ThrottlingMetricsService } from './throttling-metrics.service';
import { MetricsController } from './metrics.controller';

@Module({
  providers: [ThrottlingMetricsService],
  controllers: [MetricsController],
  exports: [ThrottlingMetricsService],
})
export class MetricsModule {}
