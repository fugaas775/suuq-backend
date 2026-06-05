import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ConsumerOrderService } from './consumer-order.service';
import { PlaceConsumerOrderDto } from './dto/place-consumer-order.dto';
import {
  ConsumerOrderResponseDto,
  ConsumerOrderStatusDto,
} from './dto/consumer-response.dto';

@Controller('consumer/v1/orders')
export class ConsumerOrderController {
  constructor(private readonly consumerOrderService: ConsumerOrderService) {}

  /**
   * POST /consumer/v1/orders
   * Places a new consumer order, landing it as a suspended cart for POS staff review.
   */
  @Post()
  placeOrder(
    @Body() dto: PlaceConsumerOrderDto,
  ): Promise<ConsumerOrderResponseDto> {
    return this.consumerOrderService.placeOrder(dto);
  }

  /**
   * GET /consumer/v1/orders/:orderId/status
   * Polls the status of a previously placed consumer order.
   */
  @Get(':orderId/status')
  getOrderStatus(
    @Param('orderId', ParseIntPipe) orderId: number,
  ): Promise<ConsumerOrderStatusDto> {
    return this.consumerOrderService.getOrderStatus(orderId);
  }
}
