import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ConsumerOrderService } from './consumer-order.service';
import { PlaceConsumerOrderDto } from './dto/place-consumer-order.dto';
import {
  ConsumerOrderResponseDto,
  ConsumerOrderStatusDto,
} from './dto/consumer-response.dto';

// Placing an order injects a cart straight onto a branch's register, so this is
// the one consumer write that costs a real person real attention. Auth stays
// optional (guests order too), but the guard makes the throttler track a signed-in
// shopper by user id instead of penalising everyone behind a shared IP — see
// AdminThrottlerGuard.getTracker.
const CONSUMER_ORDER_WRITE_THROTTLE = { default: { ttl: 60_000, limit: 10 } };
const CONSUMER_ORDER_STATUS_THROTTLE = { default: { ttl: 60_000, limit: 60 } };

@Controller('consumer/v1/orders')
@UseGuards(OptionalJwtAuthGuard)
export class ConsumerOrderController {
  constructor(private readonly consumerOrderService: ConsumerOrderService) {}

  /**
   * POST /consumer/v1/orders
   * Places a new consumer order, landing it as a suspended cart for POS staff review.
   */
  @Post()
  @Throttle(CONSUMER_ORDER_WRITE_THROTTLE)
  placeOrder(
    @Body() dto: PlaceConsumerOrderDto,
  ): Promise<ConsumerOrderResponseDto> {
    return this.consumerOrderService.placeOrder(dto);
  }

  /**
   * GET /consumer/v1/orders/:orderId/status
   * Polls the status of a previously placed consumer order.
   *
   * `ref` is the `orderNumber` handed back at placement. Orders placed since the
   * reference carries a random suffix must present it; older `C-<id>` orders are
   * still readable by id alone so in-flight polls don't break.
   */
  @Get(':orderId/status')
  @Throttle(CONSUMER_ORDER_STATUS_THROTTLE)
  getOrderStatus(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Query('ref') ref?: string,
  ): Promise<ConsumerOrderStatusDto> {
    return this.consumerOrderService.getOrderStatus(orderId, ref);
  }
}
