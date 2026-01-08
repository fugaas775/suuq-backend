import { Controller, Get, UseGuards } from '@nestjs/common';
import { ThrottlingMetricsService } from './throttling-metrics.service';
import { SubscriptionAnalyticsService } from './subscription-analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: ThrottlingMetricsService,
    private readonly subscriptionAnalytics: SubscriptionAnalyticsService,
  ) {}

  @Get('throttling')
  getThrottling() {
    return this.metrics.snapshot();
  }

  @Get('subscriptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getSubscriptionMetrics() {
    return this.subscriptionAnalytics.getAnalytics();
  }
}
