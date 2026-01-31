/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unused-vars */
// Backend: src/payments/payments.controller.ts

import {
  Controller,
  Post,
  Body,
  Logger,
  Get,
  BadRequestException,
  InternalServerErrorException,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Order,
  PaymentStatus,
  OrderStatus,
} from '../orders/entities/order.entity';
import { TelebirrCallbackDto } from './telebirr-callback.dto';
import { TelebirrService } from '../telebirr/telebirr.service';
import { TelebirrTransaction } from './entities/telebirr-transaction.entity';
import { ProductsService } from '../products/products.service';
import {
  BoostPricingService,
  BoostTier,
  BOOST_OPTIONS,
} from '../products/boost-pricing.service';
import { EbirrService } from '../ebirr/ebirr.service';
import { AuthGuard } from '@nestjs/passport'; // Add this if missing
import { RolesGuard } from '../common/guards/roles.guard'; // Add this
import { Req } from '@nestjs/common'; // Add this

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
    private readonly ebirrService: EbirrService,
    private readonly productsService: ProductsService,
    private readonly boostPricingService: BoostPricingService,
  ) {}

  // ✨ ADD THIS NEW METHOD ✨
  @Get('methods')
  getPaymentMethods() {
    // This returns a static list of your payment methods.
    // Enhanced with new regional options as requested.
    return [
      { id: 'TELEBIRR', name: 'Telebirr', country: 'ET', enabled: false },
      { id: 'EBIRR', name: 'Ebirr', country: 'ET', enabled: true }, // Coming Soon
      { id: 'CBE', name: 'CBE Birr', country: 'ET', enabled: true }, // Commercial Bank of Ethiopia
      { id: 'MPESA', name: 'M-Pesa', country: 'KE', enabled: true },
      { id: 'WAAFI', name: 'Waafi / EVC Plus', country: 'SO', enabled: true }, // Hormuud
      { id: 'DMONEY', name: 'D-Money', country: 'DJ', enabled: true }, // Djibouti
      {
        id: 'BANK_TRANSFER',
        name: 'Bank Transfer',
        country: 'ALL',
        enabled: true,
      },
    ];
  }

  @Get('transactions')
  async getTransactions() {
    return this.transactionRepository.find({ order: { created_at: 'DESC' } });
  }

  @Post('initiate-boost')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async initiateBoostPayment(
    @Body()
    body: {
      productId: number;
      tier: BoostTier;
      provider?: 'TELEBIRR' | 'EBIRR';
    },
    @Req() req: any,
  ) {
    const { productId, tier, provider = 'TELEBIRR' } = body;
    if (!productId || !tier)
      throw new BadRequestException('Product ID and Tier are required');

    // Validate Tier
    const option = BOOST_OPTIONS.find((o) => o.tier === tier);
    if (!option) throw new BadRequestException('Invalid boost tier');

    // Construct Order ID (Timestamp ensures uniqueness)
    const merchOrderId = `BOOST-${productId}-${tier}-${Date.now()}`;
    const amount = option.basePriceETB.toFixed(2);

    // Create Audit Record (Reusing TelebirrTransaction for now, or unified Transaction)
    // NOTE: For Ebirr, we might use EbirrTransaction if we want separation, or just log.
    // Ideally, we'd have a UnifiedTransaction entity.

    // For now, let's keep using transactionRepository (TelebirrTransaction) as a generic log for Telebirr
    // If provider is Ebirr, we might likely not use it or use Ebirr's own if available.

    // Let's create a generic "Pending" record if it's TELEBIRR.
    if (provider === 'TELEBIRR') {
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
        return {
          receiveCode,
          merchOrderId,
          amount,
          currency: 'ETB',
          provider: 'TELEBIRR',
        };
      } catch (e: any) {
        this.logger.error(e);
        tx.status = 'FAILED';
        tx.raw_response = e.message;
        await this.transactionRepository.save(tx);
        throw new InternalServerErrorException(
          e.message || 'Failed to initiate Telebirr payment',
        );
      }
    } else if (provider === 'EBIRR') {
      try {
        const result = await this.ebirrService.initiatePayment({
          amount: option.basePriceETB.toString(),
          referenceId: merchOrderId,
          invoiceId: merchOrderId,
          description: `Product Boost: ${productId} (${tier})`,
          phoneNumber: req.user.phoneNumber, // Optional in service, but good if we have it
        });

        // map Ebirr response to consistent format
        return {
          receiveCode: result.toPayUrl || result.receiverCode, // adjust based on Ebirr response shape
          merchOrderId,
          amount: option.basePriceETB.toString(),
          currency: 'ETB',
          provider: 'EBIRR',
          checkoutUrl: result.toPayUrl,
        };
      } catch (e: any) {
        this.logger.error(`Ebirr initiation failed: ${e.message}`);
        throw new InternalServerErrorException(
          'Failed to initiate Ebirr payment',
        );
      }
    } else {
      throw new BadRequestException('Unsupported provider');
    }
  }

  @Post('create-telebirr-order')
  async createTelebirrOrder(@Body('orderId') orderId: number) {
    if (!orderId) throw new BadRequestException('orderId is required');

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
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
      throw new InternalServerErrorException(
        e.message || 'Failed to create Telebirr order',
      );
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

    // Update Audit Log
    const tx = await this.transactionRepository.findOne({
      where: { merch_order_id: body.outTradeNo },
    });
    if (tx) {
      tx.trans_id = body.tradeNo || body.transactionId;
      tx.payment_order_id = body.tradeNo;
      tx.raw_response = JSON.stringify(body);
      tx.status = body.tradeStatus;
      await this.transactionRepository.save(tx);
    }

    const outTradeNo = body.outTradeNo || '';

    // Handle Boost Payments
    if (outTradeNo.startsWith('BOOST-')) {
      const parts = outTradeNo.split('-');
      if (parts.length >= 3) {
        const productId = parseInt(parts[1]);
        const tier = parts[2] as BoostTier;

        const status = (body.tradeStatus || '').toUpperCase();
        if (status === 'SUCCESS' || status === 'COMPLETED') {
          try {
            const product = await this.productsService.findOne(productId);
            // Act as the vendor
            await this.productsService.promoteProduct(
              productId,
              tier,
              product.vendor,
            );
            this.logger.log(
              `Successfully promoted product ${productId} to ${tier} via Telebirr`,
            );
            return { status: 'success' };
          } catch (e: any) {
            this.logger.error(
              `Failed to promote product ${productId}: ${e.message}`,
            );
            return { status: 'failed_internal' };
          }
        }
      }
      return { status: 'processed' };
    }

    const orderIdStr = outTradeNo.replace('ORDER-', '');
    const orderId = parseInt(orderIdStr);

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
  async syncStatus(
    @Param('orderId') orderId: number,
    @Query('currency') currency?: string,
  ) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'items',
        'items.product',
        'items.product.vendor',
        'deliverer',
        'user',
      ],
    });
    if (!order) throw new BadRequestException('Order not found');

    let status = 'PENDING';
    let updated = false;

    if (order.paymentStatus === PaymentStatus.PAID) {
      status = 'SUCCESS';
    } else {
      const merchOrderId = `ORDER-${order.id}`;
      try {
        const result = await this.telebirrService.queryOrder(merchOrderId);
        const data = result.data || {};
        const tradeStatus = (data.tradeStatus || '').toUpperCase();

        if (tradeStatus === 'SUCCESS' || tradeStatus === 'COMPLETED') {
          order.paymentStatus = PaymentStatus.PAID;
          await this.orderRepository.save(order);
          status = 'SUCCESS';
          updated = true;
        }
      } catch (e: any) {
        this.logger.warn(
          `Telebirr sync check skipped/failed for ${orderId}: ${e.message}`,
        );
      }
    }

    if (status === 'SUCCESS') {
      // Return full updated order DTO so app shows correct summary
      const dto = this.ordersService.mapToResponseDto(order, currency);
      return {
        status: 'Success',
        updated,
        ...dto,
      };
    }
    return { status: status || 'Unknown', updated: false };
  }

  @Post('disburse-vendor/:orderId')
  async disburseVendor(@Param('orderId') orderId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['items', 'items.product', 'items.product.vendor'],
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
      where: { merch_order_id: disbId, status: 'SUCCESS' },
    });
    if (existingDisb) return { status: 'Already disbursed' };

    try {
      const resp = await this.telebirrService.createDisburseOrder(
        vendorUser.telebirrAccount,
        vendorAmount.toFixed(2),
        disbId,
      );

      const tx = this.transactionRepository.create({
        merch_order_id: disbId,
        amount: vendorAmount,
        status: 'SUCCESS',
        raw_response: JSON.stringify(resp),
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
