// Backend: src/payments/payments.controller.ts

import { Controller, Post, Body, Logger, Get, BadRequestException, InternalServerErrorException, Param, UseGuards } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Order, PaymentStatus, OrderStatus } from '../orders/entities/order.entity';
import { TelebirrCallbackDto } from './telebirr-callback.dto';
import { TelebirrService } from '../telebirr/telebirr.service';
import { TelebirrTransaction } from './entities/telebirr-transaction.entity';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(TelebirrTransaction)
    private readonly transactionRepository: Repository<TelebirrTransaction>,
    private readonly ordersService: OrdersService,
    private readonly telebirrService: TelebirrService,
  ) {}

  // ✨ ADD THIS NEW METHOD ✨
  @Get('methods')
  getPaymentMethods() {
    // This returns a static list of your payment methods.
    // Enhanced with new regional options as requested.
    return [
      { id: 'TELEBIRR', name: 'Telebirr', country: 'ET', enabled: true },
      { id: 'EBIRR', name: 'Ebirr', country: 'ET', enabled: true }, // Coming Soon
      { id: 'CBE', name: 'CBE Birr', country: 'ET', enabled: true }, // Commercial Bank of Ethiopia
      { id: 'MPESA', name: 'M-Pesa', country: 'KE', enabled: true },
      { id: 'WAAFI', name: 'Waafi / EVC Plus', country: 'SO', enabled: true }, // Hormuud
      { id: 'DMONEY', name: 'D-Money', country: 'DJ', enabled: true }, // Djibouti
      { id: 'BANK_TRANSFER', name: 'Bank Transfer', country: 'ALL', enabled: true },
    ];
  }

  @Get('transactions')
  async getTransactions() {
    return this.transactionRepository.find({ order: { created_at: 'DESC' } });
  }

  @Post('create-telebirr-order')
  async createTelebirrOrder(@Body('orderId') orderId: number) {
    if (!orderId) throw new BadRequestException('orderId is required');

    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) throw new BadRequestException('Order not found');

    const merchOrderId = `ORDER-${order.id}`;
    const amount = Number(order.total).toFixed(2);

    // Audit Log - Pending
    const tx = this.transactionRepository.create({
        merch_order_id: merchOrderId,
        amount: Number(amount),
        status: 'PENDING',
    });
    await this.transactionRepository.save(tx);

    try {
      const receiveCode = await this.telebirrService.createOrder(
        amount,
        merchOrderId,
      );
      return { receiveCode };
    } catch (e: any) {
      this.logger.error(e);
      tx.status = 'FAILED';
      tx.raw_response = e.message;
      await this.transactionRepository.save(tx);
      throw new InternalServerErrorException(e.message || 'Failed to create Telebirr order');
    }
  }

  @Post('telebirr-callback')
  async telebirrCallback(@Body() body: any) {
    this.logger.log('Received Telebirr callback', JSON.stringify(body));

    const isValid = this.telebirrService.verifySignature(body);
    if (!isValid) {
      this.logger.warn('Invalid Telebirr Signature');
      return { status: 'failed', message: 'Invalid signature' };
    }

    const orderIdStr = (body.outTradeNo || '').replace('ORDER-', '');
    const orderId = parseInt(orderIdStr);

    // Update Audit Log
    const tx = await this.transactionRepository.findOne({ where: { merch_order_id: body.outTradeNo } });
    if (tx) {
        tx.trans_id = body.tradeNo || body.transactionId; 
        tx.payment_order_id = body.tradeNo;
        tx.raw_response = JSON.stringify(body);
        tx.status = body.tradeStatus;
        await this.transactionRepository.save(tx);
    }

    if (!orderId || isNaN(orderId)) return { status: 'order not found' };
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) return { status: 'order not found' };

    // Check for success status (case-insensitive check)
    const status = (body.tradeStatus || '').toUpperCase();

    if (status === 'SUCCESS' || status === 'COMPLETED') {
      order.paymentStatus = PaymentStatus.PAID;
      await this.orderRepository.save(order);
      return { status: 'success' };
    } else {
      order.paymentStatus = PaymentStatus.FAILED;
      await this.orderRepository.save(order);
      return { status: 'failed' };
    }
  }

  @Post('sync-status/:orderId')
  async syncStatus(@Param('orderId') orderId: number) {
      const order = await this.orderRepository.findOne({ where: { id: orderId } });
      if (!order) throw new BadRequestException('Order not found');

      const merchOrderId = `ORDER-${order.id}`;
      try {
          const result = await this.telebirrService.queryOrder(merchOrderId);
          // result.data contains detailed info. Status usually in result.data.tradeStatus
          const data = result.data || {};
          const status = (data.tradeStatus || '').toUpperCase();
          
          if (status === 'SUCCESS' || status === 'COMPLETED') {
              if (order.paymentStatus !== PaymentStatus.PAID) {
                  order.paymentStatus = PaymentStatus.PAID;
                  await this.orderRepository.save(order);
                  return { status: 'Success', updated: true };
              }
              return { status: 'Success', updated: false };
          } 
          return { status: status || 'Unknown', updated: false };
      } catch (e: any) {
          throw new InternalServerErrorException(e.message);
      }
  }

  @Post('disburse-vendor/:orderId')
  async disburseVendor(@Param('orderId') orderId: number) {
      const order = await this.orderRepository.findOne({ 
          where: { id: orderId },
          relations: ['items', 'items.product', 'items.product.vendor']
      });
      if (!order) throw new BadRequestException('Order not found');
      
      if (order.paymentStatus !== PaymentStatus.PAID) {
          throw new BadRequestException('Order not paid');
      }
      
      const total = Number(order.total);
      const commission = total * 0.05; // 5% Commission
      const vendorAmount = total - commission;
      
      // Assuming single vendor per order for now
      const vendorUser = order.items[0]?.product?.vendor;
      if (!vendorUser || !vendorUser.telebirrAccount) {
          throw new BadRequestException('Vendor Telebirr account not found');
      }

      if (!vendorUser.telebirrVerified) {
          throw new BadRequestException('Vendor Telebirr account not verified');
      }
      
      const disbId = `DISB-${order.id}`;
      const existingDisb = await this.transactionRepository.findOne({ 
          where: { merch_order_id: disbId, status: 'SUCCESS' } 
      });
      if (existingDisb) return { status: 'Already disbursed' };
      
      try {
          const resp = await this.telebirrService.createDisburseOrder(
              vendorUser.telebirrAccount,
              vendorAmount.toFixed(2),
              disbId
          );
          
          const tx = this.transactionRepository.create({
            merch_order_id: disbId,
            amount: vendorAmount,
            status: 'SUCCESS', 
            raw_response: JSON.stringify(resp)
          });
          await this.transactionRepository.save(tx);
          
          return { status: 'Disbursement initiated', details: resp };
      } catch (e: any) {
          throw new InternalServerErrorException(e.message);
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
