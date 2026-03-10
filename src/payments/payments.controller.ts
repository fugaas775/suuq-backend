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
  Req,
} from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Order,
  PaymentMethod,
  PaymentStatus,
  OrderStatus,
} from '../orders/entities/order.entity';
import { TelebirrCallbackDto } from './telebirr-callback.dto';
import { TelebirrService } from '../telebirr/telebirr.service';
import { TelebirrTransaction } from './entities/telebirr-transaction.entity';
import { EbirrTransaction } from './entities/ebirr-transaction.entity';
import { ProductsService } from '../products/products.service';
import {
  BoostPricingService,
  BoostTier,
  BOOST_OPTIONS,
} from '../products/boost-pricing.service';
import { EbirrService } from '../ebirr/ebirr.service';
import { CurrencyService } from '../common/services/currency.service';
import { AuthGuard } from '@nestjs/passport'; // Add this if missing
import { RolesGuard } from '../common/guards/roles.guard'; // Add this

type PaymentMethodId =
  | 'STARPAY'
  | 'TELEBIRR'
  | 'EBIRR'
  | 'CREDIT'
  | 'CBE'
  | 'MPESA'
  | 'WAAFI'
  | 'DMONEY'
  | 'BANK_TRANSFER';

type PaymentMethodDef = {
  id: PaymentMethodId;
  name: string;
  countries: string[];
  supportsBoost: boolean;
  readinessEnv: string[];
};

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);
  private readonly paymentMethodCatalog: PaymentMethodDef[] = [
    {
      id: 'STARPAY',
      name: 'StarPay',
      countries: ['SO'],
      supportsBoost: false,
      readinessEnv: [
        'STARPAY_MERCHANT_NAME',
        'STARPAY_MERCHANT_ID',
        'STARPAY_SECRET_KEY',
        'STARPAY_BASE_URL',
      ],
    },
    {
      id: 'TELEBIRR',
      name: 'Telebirr',
      countries: ['ET'],
      supportsBoost: true,
      readinessEnv: [
        'TELEBIRR_APP_ID',
        'TELEBIRR_APP_KEY',
        'TELEBIRR_SHORT_CODE',
        'TELEBIRR_PUBLIC_KEY',
        'TELEBIRR_PRIVATE_KEY',
      ],
    },
    {
      id: 'EBIRR',
      name: 'Ebirr',
      countries: ['ET'],
      supportsBoost: true,
      readinessEnv: [
        'EBIRR_BASE_URL',
        'EBIRR_API_KEY',
        'EBIRR_MERCHANT_ID',
        'EBIRR_API_USER_ID',
      ],
    },
    {
      id: 'CREDIT',
      name: 'BNPL',
      countries: ['ET'],
      supportsBoost: false,
      readinessEnv: ['__INTERNAL_CREDIT_AVAILABLE__'],
    },
    {
      id: 'CBE',
      name: 'CBE Birr',
      countries: ['ET'],
      supportsBoost: false,
      readinessEnv: [],
    },
    {
      id: 'MPESA',
      name: 'M-Pesa',
      countries: ['KE'],
      supportsBoost: false,
      readinessEnv: [],
    },
    {
      id: 'WAAFI',
      name: 'Waafi / EVC Plus',
      countries: ['SO'],
      supportsBoost: false,
      readinessEnv: [],
    },
    {
      id: 'DMONEY',
      name: 'D-Money',
      countries: ['DJ'],
      supportsBoost: false,
      readinessEnv: [],
    },
    {
      id: 'BANK_TRANSFER',
      name: 'Bank Transfer',
      countries: ['ALL'],
      supportsBoost: false,
      readinessEnv: [],
    },
  ];

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(TelebirrTransaction)
    private readonly transactionRepository: Repository<TelebirrTransaction>,
    @InjectRepository(EbirrTransaction)
    private readonly ebirrTransactionRepository: Repository<EbirrTransaction>,
    private readonly ordersService: OrdersService,
    private readonly telebirrService: TelebirrService,
    private readonly ebirrService: EbirrService,
    private readonly productsService: ProductsService,
    private readonly boostPricingService: BoostPricingService,
    private readonly currencyService: CurrencyService,
  ) {}

  private normalizeCountry(input?: string): string | null {
    const value = String(input || '')
      .trim()
      .toUpperCase();
    if (!value) return null;

    if (value === 'ET' || value === 'ETHIOPIA') return 'ET';
    if (value === 'SO' || value === 'SOMALIA') return 'SO';
    if (value === 'KE' || value === 'KENYA') return 'KE';
    if (value === 'DJ' || value === 'DJIBOUTI') return 'DJ';

    return value;
  }

  private envVarReady(key: string): boolean {
    const value = String(process.env[key] || '').trim();
    if (!value) return false;
    if (value.toUpperCase().includes('PLACEHOLDER')) return false;
    return true;
  }

  private providerEnabled(providerId: PaymentMethodId): boolean {
    const forcedEnabled = String(process.env.PAYMENT_METHODS_FORCE_ENABLE || '')
      .split(',')
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);

    const forcedDisabled = String(
      process.env.PAYMENT_METHODS_FORCE_DISABLE || '',
    )
      .split(',')
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);

    if (forcedDisabled.includes(providerId)) return false;
    if (forcedEnabled.includes(providerId)) return true;

    const def = this.paymentMethodCatalog.find((m) => m.id === providerId);
    if (!def) return false;

    if (providerId === 'CREDIT') {
      return true;
    }

    if (!def.readinessEnv.length) {
      return false;
    }

    return def.readinessEnv.every((envKey) => this.envVarReady(envKey));
  }

  private deriveEbirrTelemetryTag(providerCode?: string | null): string {
    const code = String(providerCode || '').trim();
    if (code === '5309') {
      return 'EBIRR_EXPECTED_DECLINE_5309_INSUFFICIENT_BALANCE';
    }
    if (code === 'E10205') {
      return 'EBIRR_EXPECTED_DECLINE_E10205_INSUFFICIENT_BALANCE';
    }
    if (code === '5310') {
      return 'EBIRR_EXPECTED_DECLINE_5310_USER_REJECTED';
    }
    if (/^E\d+$/i.test(code) || code === 'ORDER_PAYMENT_FAILED') {
      return 'EBIRR_SYSTEM_ERROR';
    }
    return 'EBIRR_PROVIDER_DECLINE';
  }

  private resolveCountryFromRequest(
    req: any,
    queryCountry?: string,
  ): string | null {
    const headerCountry =
      req?.headers?.['x-user-country'] ||
      req?.headers?.['x-country'] ||
      req?.headers?.['cf-ipcountry'] ||
      req?.headers?.['x-vercel-ip-country'] ||
      req?.headers?.['x-country-code'];

    return this.normalizeCountry(queryCountry || String(headerCountry || ''));
  }

  private listPaymentMethods(opts?: {
    purpose?: 'boost' | 'checkout';
    country?: string | null;
  }) {
    const country = this.normalizeCountry(opts?.country || undefined);
    const purpose = opts?.purpose || 'checkout';

    let methods = this.paymentMethodCatalog
      .filter((m) => (purpose === 'boost' ? m.supportsBoost : true))
      .filter((m) => {
        if (!country) return true;
        return m.countries.includes('ALL') || m.countries.includes(country);
      });

    if (purpose === 'checkout' && country === 'ET') {
      const allowedEthiopiaMethods: PaymentMethodId[] = ['EBIRR', 'CREDIT'];
      methods = methods.filter((m) => allowedEthiopiaMethods.includes(m.id));
    }

    return methods.map((m) => ({
      id: m.id,
      name: m.name,
      country: m.countries.length === 1 ? m.countries[0] : 'MULTI',
      countries: m.countries,
      enabled: this.providerEnabled(m.id),
      supportsBoost: m.supportsBoost,
    }));
  }

  @Get('methods')
  getPaymentMethods(@Req() req: any, @Query('country') country?: string) {
    const resolvedCountry = this.resolveCountryFromRequest(req, country);
    return {
      country: resolvedCountry,
      methods: this.listPaymentMethods({
        purpose: 'checkout',
        country: resolvedCountry,
      }),
    };
  }

  @Get('boost-methods')
  getBoostPaymentMethods(@Req() req: any, @Query('country') country?: string) {
    const resolvedCountry = this.resolveCountryFromRequest(req, country);
    return {
      country: resolvedCountry,
      methods: this.listPaymentMethods({
        purpose: 'boost',
        country: resolvedCountry,
      }),
    };
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

    const normalizedProvider = String(provider || 'TELEBIRR').toUpperCase() as
      | 'TELEBIRR'
      | 'EBIRR';
    const userCountry = this.resolveCountryFromRequest(req);
    const boostMethods = this.listPaymentMethods({
      purpose: 'boost',
      country: userCountry,
    }).filter((m) => m.enabled);

    const selectedMethod = boostMethods.find(
      (m) => m.id === normalizedProvider,
    );

    if (!selectedMethod) {
      throw new BadRequestException(
        `Provider ${normalizedProvider} is not enabled for boost${userCountry ? ` in ${userCountry}` : ''}`,
      );
    }

    // Construct Order ID (Timestamp ensures uniqueness)
    const merchOrderId = `BOOST-${productId}-${tier}-${Date.now()}`;
    const amount = this.currencyService.formatAmount(
      option.basePriceETB,
      'ETB',
    );

    // Create Audit Record (Reusing TelebirrTransaction for now, or unified Transaction)
    // NOTE: For Ebirr, we might use EbirrTransaction if we want separation, or just log.
    // Ideally, we'd have a UnifiedTransaction entity.

    // For now, let's keep using transactionRepository (TelebirrTransaction) as a generic log for Telebirr
    // If provider is Ebirr, we might likely not use it or use Ebirr's own if available.

    // Let's create a generic "Pending" record if it's TELEBIRR.
    if (normalizedProvider === 'TELEBIRR') {
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
    } else if (normalizedProvider === 'EBIRR') {
      try {
        const result = await this.ebirrService.initiatePayment({
          amount: this.currencyService.formatAmount(option.basePriceETB, 'ETB'),
          referenceId: merchOrderId,
          invoiceId: merchOrderId,
          description: `Product Boost: ${productId} (${tier})`,
          phoneNumber: req.user.phoneNumber, // Optional in service, but good if we have it
        });

        // map Ebirr response to consistent format
        return {
          receiveCode: result.toPayUrl || result.receiverCode, // adjust based on Ebirr response shape
          merchOrderId,
          amount: this.currencyService.formatAmount(option.basePriceETB, 'ETB'),
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
    const amount = this.currencyService.formatAmount(
      Number(order.total),
      order.currency || 'ETB',
    );

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
    let ebirrFailureDetails: Record<string, any> | null = null;

    if (order.paymentStatus === PaymentStatus.PAID) {
      status = 'SUCCESS';
    } else if (order.paymentMethod === 'EBIRR') {
      const refIds = [`REF-${order.id}`, `ORDER-${order.id}`];
      const ebirrTx = await this.ebirrTransactionRepository
        .createQueryBuilder('tx')
        .where('tx.merch_order_id IN (:...refIds)', { refIds })
        .orderBy('tx.updated_at', 'DESC')
        .addOrderBy('tx.created_at', 'DESC')
        .getOne();

      const txStatus = String(ebirrTx?.status || '').toUpperCase();
      const failedByTx = ['FAILED', 'ERROR'].includes(txStatus);
      const failedByOrder = order.paymentStatus === PaymentStatus.FAILED;

      if (failedByTx || failedByOrder) {
        status = 'FAILED';
        const providerCode =
          ebirrTx?.response_code ||
          (failedByOrder ? 'ORDER_PAYMENT_FAILED' : 'EBIRR_FAILED');
        const providerRef =
          ebirrTx?.req_transaction_id ||
          ebirrTx?.trans_id ||
          ebirrTx?.issuer_trans_id ||
          null;
        const providerMessage =
          ebirrTx?.response_msg ||
          ebirrTx?.raw_response_payload?.responseMsg ||
          ebirrTx?.raw_response_payload?.message ||
          'Payment failed';

        ebirrFailureDetails = {
          provider: 'EBIRR',
          providerCode,
          telemetryTag: this.deriveEbirrTelemetryTag(providerCode),
          expectedDecline: ['5309', '5310'].includes(String(providerCode)),
          providerRef,
          message: providerMessage,
        };
      }
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

    if (status === 'FAILED' && ebirrFailureDetails) {
      return {
        status: 'FAILED',
        updated: false,
        details: ebirrFailureDetails,
        skipOrderConfirmationScreen:
          order.paymentMethod === PaymentMethod.EBIRR,
        disableWebCheckoutFallback: order.paymentMethod === PaymentMethod.EBIRR,
      };
    }

    return {
      status: status || 'Unknown',
      updated: false,
      skipOrderConfirmationScreen: order.paymentMethod === PaymentMethod.EBIRR,
      disableWebCheckoutFallback: order.paymentMethod === PaymentMethod.EBIRR,
    };
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
