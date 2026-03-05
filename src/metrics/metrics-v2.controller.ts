import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Get,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FeedInteractionService } from './feed-interaction.service';
import { CreateFeedInteractionDto } from './dto/create-feed-interaction.dto';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';

@ApiTags('Metrics')
@Controller('v2/metrics')
export class MetricsV2Controller {
  constructor(
    private readonly feedInteractionService: FeedInteractionService,
  ) {}

  @Post('feed-interaction')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Log a user interaction with a product from the home feed',
  })
  @ApiResponse({ status: 201, description: 'Interaction logged successfully' })
  async logFeedInteraction(
    @Body() dto: CreateFeedInteractionDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    await this.feedInteractionService.logInteraction(dto, userId);
    return { success: true };
  }

  @Get('feed-interaction/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Admin summary for feed telemetry quality and funnel rates',
  })
  @ApiResponse({ status: 200, description: 'Summary returned successfully' })
  async getFeedInteractionSummary(
    @Query('sinceHours', new DefaultValuePipe(24), ParseIntPipe)
    sinceHours: number,
  ) {
    return this.feedInteractionService.getSummary(sinceHours);
  }

  @Get('feed-interaction/top-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Admin top products for buy_now and add_to_cart with attributed vs unattributed breakdown',
  })
  @ApiResponse({
    status: 200,
    description: 'Top products summary returned successfully',
  })
  async getFeedInteractionTopProducts(
    @Query('sinceHours', new DefaultValuePipe(24), ParseIntPipe)
    sinceHours: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe)
    limit: number,
    @Query('includeProduct', new DefaultValuePipe('true'))
    includeProduct: string,
    @Query('sortBy', new DefaultValuePipe('total'))
    sortBy: string,
    @Query('sortOrder', new DefaultValuePipe('desc'))
    sortOrder: string,
  ) {
    return this.feedInteractionService.getTopProductsSummary(
      sinceHours,
      limit,
      includeProduct !== 'false',
      sortBy,
      sortOrder,
    );
  }

  @Get('feed-interaction/unattributed-top-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Admin unattributed top products by action over time buckets (hour/day) to detect rollout attribution gaps',
  })
  @ApiResponse({
    status: 200,
    description: 'Unattributed top products over time returned successfully',
  })
  async getUnattributedTopProductsOverTime(
    @Query('sinceHours', new DefaultValuePipe(24), ParseIntPipe)
    sinceHours: number,
    @Query('limitPerBucket', new DefaultValuePipe(10), ParseIntPipe)
    limitPerBucket: number,
    @Query('bucket', new DefaultValuePipe('hour'))
    bucket: string,
    @Query('action')
    action?: string,
    @Query('includeProduct', new DefaultValuePipe('true'))
    includeProduct?: string,
    @Query('tzOffsetMinutes', new DefaultValuePipe(0), ParseIntPipe)
    tzOffsetMinutes?: number,
  ) {
    return this.feedInteractionService.getUnattributedTopProductsOverTime(
      sinceHours,
      limitPerBucket,
      bucket,
      action,
      includeProduct !== 'false',
      tzOffsetMinutes,
    );
  }

  @Get('feed-interaction/attribution-trends')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Admin hourly trend lines per action for attributed vs unattributed feed interactions',
  })
  @ApiResponse({
    status: 200,
    description: 'Hourly attribution trend lines returned successfully',
  })
  async getFeedInteractionAttributionTrends(
    @Query('sinceHours', new DefaultValuePipe(24), ParseIntPipe)
    sinceHours: number,
    @Query('action')
    action?: string,
    @Query('tzOffsetMinutes', new DefaultValuePipe(0), ParseIntPipe)
    tzOffsetMinutes?: number,
  ) {
    return this.feedInteractionService.getAttributionTrendsHourly(
      sinceHours,
      action,
      tzOffsetMinutes,
    );
  }

  @Get('feed-interaction/anomaly-health')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Compact anomaly health check for attribution spikes (alerting-friendly)',
  })
  @ApiResponse({
    status: 200,
    description: 'Anomaly health snapshot returned successfully',
  })
  async getFeedInteractionAnomalyHealth(
    @Query('profile', new DefaultValuePipe('relaxed'))
    profile: string,
    @Query('sinceHours', new DefaultValuePipe(24), ParseIntPipe)
    sinceHours: number,
    @Query('baselineHours', new DefaultValuePipe(6), ParseIntPipe)
    baselineHours: number,
    @Query('action')
    action?: string,
    @Query('tzOffsetMinutes', new DefaultValuePipe(0), ParseIntPipe)
    tzOffsetMinutes?: number,
    @Query('minEvents', new DefaultValuePipe(20), ParseIntPipe)
    minEvents?: number,
    @Query('minUnattributedEvents', new DefaultValuePipe(5), ParseIntPipe)
    minUnattributedEvents?: number,
    @Query('unattributedRateThreshold', new DefaultValuePipe('0.2'))
    unattributedRateThreshold?: string,
    @Query('spikeMultiplier', new DefaultValuePipe('2'))
    spikeMultiplier?: string,
  ) {
    return this.feedInteractionService.getAnomalyHealth({
      profile,
      sinceHours,
      baselineHours,
      action,
      tzOffsetMinutes,
      minEvents,
      minUnattributedEvents,
      unattributedRateThreshold: Number(unattributedRateThreshold),
      spikeMultiplier: Number(spikeMultiplier),
    });
  }
}
