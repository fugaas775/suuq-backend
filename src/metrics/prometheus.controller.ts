import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { PrometheusService } from './prometheus.service';

@Controller()
export class PrometheusController {
  constructor(private readonly prom: PrometheusService) {}

  @Get('/metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  getMetrics(): string {
    const enabled = (process.env.METRICS_ENABLED || 'false').toLowerCase() === 'true';
    if (!enabled) {
      throw new NotFoundException();
    }
    return this.prom.metrics();
  }
}
