// Backend: src/payments/payments.controller.ts

import { Controller, Post, Body, Logger, Get } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Order, PaymentStatus } from '../orders/entities/order.entity';
import { TelebirrCallbackDto } from './telebirr-callback.dto';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly ordersService: OrdersService,
  ) {}

  // ✨ ADD THIS NEW METHOD ✨
  @Get('methods')
  getPaymentMethods() {
    // This returns a static list of your payment methods.
    // You can make this dynamic later if needed.
    return [
      { id: 'telebirr', name: 'Telebirr', enabled: true },
      { id: 'mpesa', name: 'M-Pesa', enabled: true },
    ];
  }

  @Post('telebirr-callback')
  async telebirrCallback(@Body() body: TelebirrCallbackDto) {
    this.logger.log('Received Telebirr callback', JSON.stringify(body));
    const orderId = parseInt((body.outTradeNo || '').replace('ORDER-', ''));
    if (!orderId || isNaN(orderId)) return { status: 'order not found' };
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) return { status: 'order not found' };
    if (body.tradeStatus === 'SUCCESS') {
      order.paymentStatus = PaymentStatus.PAID;
      await this.orderRepository.save(order);
      return { status: 'success' };
    } else {
      order.paymentStatus = PaymentStatus.FAILED;
      await this.orderRepository.save(order);
      return { status: 'failed' };
    }
  }

  @Post('mpesa-callback')
  async mpesaCallback(
    @Body()
    body: {
      Body?: {
        stkCallback?: {
          ResultCode?: number;
          CallbackMetadata?: unknown;
          MerchantRequestID?: string;
          CheckoutRequestID?: string;
          AccountReference?: string;
        };
      };
    },
  ) {
    this.logger.log('Received M-Pesa callback', JSON.stringify(body));
    const callback = body.Body?.stkCallback;
    if (!callback) return { status: 'ignored' };
    const resultCode = callback.ResultCode ?? -1;
    const accountRef = callback.AccountReference || '';
    const orderId = parseInt((accountRef || '').replace('ORDER-', ''));
    if (!orderId || isNaN(orderId)) return { status: 'order not found' };
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) return { status: 'order not found' };
    if (resultCode === 0) {
      order.paymentStatus = PaymentStatus.PAID;
      await this.orderRepository.save(order);
      return { status: 'success' };
    } else {
      order.paymentStatus = PaymentStatus.FAILED;
      await this.orderRepository.save(order);
      return { status: 'failed' };
    }
  }
}
