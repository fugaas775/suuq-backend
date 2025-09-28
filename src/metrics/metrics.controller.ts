import { Controller, Get } from '@nestjs/common';
import { ThrottlingMetricsService } from './throttling-metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: ThrottlingMetricsService) {}

  @Get('throttling')
  getThrottling() {
    return this.metrics.snapshot();
  }
}
