import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ebirrConfig } from './ebirr.config';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import {
  Order,
  PaymentStatus,
  OrderStatus,
} from '../orders/entities/order.entity';
import { OrdersService } from '../orders/orders.service';
import { CurrencyService } from '../common/services/currency.service';
import { RedisService } from '../redis/redis.service';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Cron, CronExpression } from '@nestjs/schedule';

import { format, subMinutes } from 'date-fns';

@Injectable()
export class EbirrService {
  private readonly logger = new Logger(EbirrService.name);

  private validatePayoutPreflight(params: {
    phoneNumberRaw: string;
    normalizedPhone: string | null;
    effectivePayee: string;
    amount: number;
    referenceId: string;
    remark?: string;
    payerAccount?: string;
  }): {
    ok: boolean;
    rejectedFields: Array<{
      field: string;
      reason: string;
      value?: unknown;
    }>;
  } {
    const rejectedFields: Array<{
      field: string;
      reason: string;
      value?: unknown;
    }> = [];

    const push = (field: string, reason: string, value?: unknown) => {
      rejectedFields.push({ field, reason, value });
    };

    const amountNumber = Number(params.amount);
    if (!Number.isFinite(amountNumber)) {
      push('amount', 'must be a finite number', params.amount);
    } else if (amountNumber <= 0) {
      push('amount', 'must be greater than 0', params.amount);
    }

    const referenceId = String(params.referenceId || '').trim();
    if (!referenceId) {
      push('referenceId', 'is required', params.referenceId);
    } else if (referenceId.length > 64) {
      push('referenceId', 'must be <= 64 characters', referenceId.length);
    } else if (!/^[A-Za-z0-9._-]+$/.test(referenceId)) {
      push(
        'referenceId',
        'contains unsupported characters (allowed: A-Z a-z 0-9 . _ -)',
        referenceId,
      );
    }

    if (params.remark && String(params.remark).length > 140) {
      push('remark', 'must be <= 140 characters', String(params.remark).length);
    }

    if (!params.normalizedPhone) {
      push(
        'phoneNumber',
        'invalid format; expected Ethiopian mobile MSISDN in 2519XXXXXXXX form',
        params.phoneNumberRaw,
      );
    }

    const normalizedEffectivePayee = this.normalizeEthiopianMsisdn(
      params.effectivePayee,
    );
    if (!normalizedEffectivePayee) {
      push(
        'payeeInfo.accountNo',
        'invalid payout recipient format; expected 2519XXXXXXXX',
        params.effectivePayee,
      );
    }

    if (params.payerAccount) {
      const payerDigits = String(params.payerAccount).replace(/\D/g, '');
      if (!payerDigits || payerDigits.length < 5 || payerDigits.length > 20) {
        push(
          'payerInfo.accountNo',
          'must be 5-20 digits when provided',
          params.payerAccount,
        );
      }
    }

    if (!String(ebirrConfig.baseUrl || '').trim()) {
      push('ebirr.baseUrl', 'missing configuration');
    }
    if (!String(ebirrConfig.merchantUid || '').trim()) {
      push('ebirr.merchantUid', 'missing configuration');
    }
    if (!String(ebirrConfig.apiKey || '').trim()) {
      push('ebirr.apiKey', 'missing configuration');
    }
    if (!String(ebirrConfig.apiUserId || '').trim()) {
      push('ebirr.apiUserId', 'missing configuration');
    }

    return {
      ok: rejectedFields.length === 0,
      rejectedFields,
    };
  }

  private normalizeEthiopianMsisdn(phone: string): string | null {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return null;

    // Handle 25109XXXXXXXX format (13 digits) caused by aggressive dial code merging
    if (digits.startsWith('25109') && digits.length === 13) {
      return `2519${digits.substring(5)}`;
    }

    // Handle 25107XXXXXXXX format (13 digits) for Safaricom/other carriers
    if (digits.startsWith('25107') && digits.length === 13) {
      return `2517${digits.substring(5)}`;
    }

    // Standard expected format (2519... or 2517...)
    if (
      (digits.startsWith('2519') || digits.startsWith('2517')) &&
      digits.length === 12
    ) {
      return digits;
    }

    if (
      (digits.startsWith('09') || digits.startsWith('07')) &&
      digits.length === 10
    ) {
      return `251${digits.substring(1)}`;
    }

    if (
      (digits.startsWith('9') || digits.startsWith('7')) &&
      digits.length === 9
    ) {
      return `251${digits}`;
    }

    return null;
  }

  private derivePaymentLifecycleStateForSync(params: {
    order: Order;
    transactionStatus?: string | null;
    transactionUpdatedAt?: Date | null;
  }): 'CREATED' | 'INITIATED' | 'RECONCILING' | 'PAID' | 'FAILED' {
    const { order, transactionStatus, transactionUpdatedAt } = params;

    if (order.paymentStatus === PaymentStatus.PAID) {
      return 'PAID';
    }

    if (
      order.paymentStatus === PaymentStatus.FAILED ||
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.CANCELLED_BY_BUYER ||
      order.status === OrderStatus.CANCELLED_BY_SELLER
    ) {
      return 'FAILED';
    }

    const txStatus = String(transactionStatus || '')
      .trim()
      .toUpperCase();

    if (!txStatus) {
      return 'CREATED';
    }

    if (txStatus === 'COMPLETED' || txStatus === 'SUCCESS') {
      return 'PAID';
    }

    if (txStatus === 'FAILED' || txStatus === 'ERROR') {
      return 'FAILED';
    }

    if (txStatus === 'EXPIRED') {
      return 'RECONCILING';
    }

    if (txStatus === 'INITIATED' || txStatus === 'PENDING') {
      if (
        transactionUpdatedAt &&
        transactionUpdatedAt < subMinutes(new Date(), 2)
      ) {
        return 'RECONCILING';
      }
      return 'INITIATED';
    }

    return 'INITIATED';
  }

  private maskAccountNumber(accountNo: string): string {
    const normalized = accountNo.replace(/\s+/g, '');
    if (normalized.length <= 4) {
      return '****';
    }
    return `${normalized.slice(0, 6)}****${normalized.slice(-2)}`;
  }

  private redactForLogs(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactForLogs(item));
    }

    if (value && typeof value === 'object') {
      const redacted: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (key === 'apiKey' || key === 'apiUserId') {
          redacted[key] = '[REDACTED]';
          continue;
        }

        if (key === 'accountNo' && typeof nestedValue === 'string') {
          redacted[key] = this.maskAccountNumber(nestedValue);
          continue;
        }

        redacted[key] = this.redactForLogs(nestedValue);
      }
      return redacted;
    }

    return value;
  }

  constructor(
    @InjectRepository(EbirrTransaction)
    private readonly ebirrTransactionRepo: Repository<EbirrTransaction>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    private readonly redisService: RedisService,
    private readonly currencyService: CurrencyService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkPendingTransactions() {
    // Locking to prevent multiple instances from running this job simultaneously
    const client = this.redisService.getClient();
    if (client) {
      const lockKey = 'lock:ebirr:check-pending';
      // Try to acquire lock for 55 seconds (since it runs every minute)

      const acquired = await client.set(lockKey, 'locked', 'NX', 'EX', 55);
      if (!acquired) {
        // Silently skip if locked
        return;
      }
    }

    this.logger.debug('Checking for pending Ebirr transactions...');
    const tenMinutesAgo = subMinutes(new Date(), 10);
    const thirtyMinutesAgo = subMinutes(new Date(), 30);

    const pendingTransactions = await this.ebirrTransactionRepo.find({
      where: {
        status: 'PENDING',
        created_at: LessThan(tenMinutesAgo),
      },
    });

    const staleInitiatedTransactions = await this.ebirrTransactionRepo.find({
      where: {
        status: 'INITIATED',
        updated_at: LessThan(thirtyMinutesAgo),
      },
    });

    if (pendingTransactions.length > 0) {
      this.logger.warn(
        `Found ${pendingTransactions.length} pending transactions to expire.`,
      );
      for (const tx of pendingTransactions) {
        tx.status = 'EXPIRED';
        tx.response_msg = 'Transaction timed out locally';
        await this.ebirrTransactionRepo.save(tx);
      }
    }

    if (staleInitiatedTransactions.length > 0) {
      this.logger.warn(
        `Found ${staleInitiatedTransactions.length} stale initiated Ebirr transactions to expire.`,
      );
      for (const tx of staleInitiatedTransactions) {
        tx.status = 'EXPIRED';
        tx.response_msg =
          tx.response_msg || 'Transaction initiated but not confirmed in time';
        await this.ebirrTransactionRepo.save(tx);
      }
    }
  }

  /**
   * Simple connectivity check to the configured base URL.
   * Useful for verifying whitelisting and network reachability.
   */
  async checkConnectivity(): Promise<{
    success: boolean;
    status?: number;
    data?: any;
  }> {
    try {
      this.logger.log(
        `Checking connectivity to Ebirr at ${ebirrConfig.baseUrl}`,
      );

      // We expect a 405 or 404 on the root, but not a timeout or connection refused
      const response = await axios.get(ebirrConfig.baseUrl, {
        validateStatus: (status) => true, // We just want to know if we reached the server
        timeout: 5000, // 5s timeout
      });

      this.logger.log(`Ebirr connectivity check response: ${response.status}`);

      return {
        success: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      this.logger.error('Ebirr connectivity failed', error);
      return {
        success: false,
      };
    }
  }

  /**
   * Send a Direct B2C Payout to a phone number.
   * NOTE: Verify 'serviceName' and payload structure with Ebirr Docs.
   */
  async sendPayout(params: {
    phoneNumber: string;
    amount: number;
    referenceId: string;
    remark?: string;
  }) {
    const { phoneNumber, amount, referenceId, remark } = params;

    const requestId = `Payout_${uuidv4()}`;
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

    const formattedPhone = this.normalizeEthiopianMsisdn(phoneNumber);

    // In sandbox, optionally force a whitelisted recipient number (e.g. 251915333513)
    // Allow override in non-production OR when explicitly forced via EBIRR_FORCE_SANDBOX=true
    const sandboxPayee = process.env.EBIRR_SANDBOX_PAYEE;
    const forceSandbox = process.env.EBIRR_FORCE_SANDBOX === 'true';
    const isNonProd = process.env.NODE_ENV !== 'production';
    const effectivePayee =
      sandboxPayee && (isNonProd || forceSandbox)
        ? sandboxPayee
        : formattedPhone;

    const payerAccount = process.env.EBIRR_PAYOUT_PAYER;

    const preflight = this.validatePayoutPreflight({
      phoneNumberRaw: phoneNumber,
      normalizedPhone: formattedPhone,
      effectivePayee: String(effectivePayee || ''),
      amount,
      referenceId,
      remark,
      payerAccount,
    });

    if (!preflight.ok) {
      const redactedRejections = preflight.rejectedFields.map((item) => {
        if (
          (item.field === 'payeeInfo.accountNo' ||
            item.field === 'payerInfo.accountNo' ||
            item.field === 'phoneNumber') &&
          typeof item.value === 'string'
        ) {
          return {
            ...item,
            value: this.maskAccountNumber(item.value),
          };
        }
        return item;
      });

      this.logger.error(
        `Ebirr payout preflight rejected request | rejectedFields=${JSON.stringify(redactedRejections)}`,
      );
      throw new BadRequestException({
        message: 'Invalid Ebirr payout request',
        rejectedFields: redactedRejections,
      });
    }

    const payload = {
      schemaVersion: '1.0',
      requestId: requestId,
      timestamp: timestamp,
      channelName: 'WEB',
      // Ebirr B2C payout service; RMT_PAYOUT is typically required for sandbox B2C
      serviceName: 'RMT_PAYOUT',
      serviceParams: {
        merchantUid: ebirrConfig.merchantUid,
        paymentMethod: 'MWALLET_ACCOUNT',
        apiKey: ebirrConfig.apiKey,
        apiUserId: ebirrConfig.apiUserId,
        ...(payerAccount ? { payerInfo: { accountNo: payerAccount } } : {}),
        payeeInfo: {
          accountNo: effectivePayee,
        },
        transactionInfo: {
          referenceId: referenceId,
          invoiceId: referenceId,
          amount: this.currencyService.formatAmount(amount, 'ETB'),
          currency: 'ETB',
          description: remark || 'Vendor Payout',
        },
      },
    };

    try {
      this.logger.log(
        `Initiating Ebirr Payout with payload: ${JSON.stringify(this.redactForLogs(payload))}`,
      );
      const response = await axios.post(ebirrConfig.baseUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      // Log the raw response for debugging
      this.logger.debug(
        `Ebirr Payout Response: ${JSON.stringify(response.data)}`,
      );

      // Ebirr success is usually code 200 or 0
      if (
        response.data &&
        (response.data.errorCode === '0' ||
          response.data.responseCode === '200')
      ) {
        return { success: true, data: response.data };
      } else {
        const debugData = JSON.stringify(response.data);
        this.logger.error(
          `Ebirr Payout Non-Success responseCode=${response.data?.responseCode} errorCode=${response.data?.errorCode} msg=${response.data?.responseMsg} | data=${debugData}`,
        );
        throw new Error(response.data?.responseMsg || 'Unknown Ebirr Error');
      }
    } catch (error: any) {
      // Capture upstream details to diagnose E10309/Ebirr errors
      const status = error.response?.status;
      const data = error.response?.data;
      const headers = error.response?.headers;
      this.logger.error(
        `Ebirr Payout Failed: ${error.message} (status=${status ?? 'n/a'}) | data=${JSON.stringify(data)} | headers=${JSON.stringify(headers)}`,
      );
      throw new Error(`Payout Failed: ${error.message}`);
    }
  }

  async initiatePayment(params: {
    phoneNumber?: string;
    amount: string;
    referenceId: string;
    invoiceId: string;
    description?: string;
  }) {
    const { phoneNumber, amount, referenceId, invoiceId, description } = params;
    const startedAt = Date.now();

    const requestId = `Suuq_${uuidv4()}`;
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

    const formattedPhone = phoneNumber
      ? this.normalizeEthiopianMsisdn(phoneNumber)
      : null;

    if (!formattedPhone) {
      throw new BadRequestException(
        'phoneNumber is required for Ebirr payments.',
      );
    }

    // Ebirr requires MSISDN in 2519XXXXXXXX format; fail fast on invalid input.
    if (!(formattedPhone.startsWith('2519') && formattedPhone.length === 12)) {
      throw new BadRequestException(
        'Invalid Ebirr phone number; use 2519XXXXXXXX format.',
      );
    }

    // Check if Order is already PAID to prevent double payment
    let orderId: number;
    // Attempt to extract numeric Order ID from invoiceId (e.g. "INV-97" -> 97)
    const matches = invoiceId.match(/(\d+)/);
    if (matches && matches[0]) {
      orderId = parseInt(matches[0], 10);
    } else {
      orderId = parseInt(invoiceId, 10);
    }

    if (!isNaN(orderId)) {
      const order = await this.orderRepo.findOne({ where: { id: orderId } });
      if (order && order.paymentStatus === PaymentStatus.PAID) {
        throw new BadRequestException('Order already paid');
      }
    }

    // We point returnUrl to our backend to capture the success and update the database,
    // before redirecting the user back to the app.
    // NOTE: Temporarily removing returnUrl to match the snippet provided by Ebirr Team.
    // If redirects fail, we may need to add this back or configure it in the portal.
    if (!process.env.API_URL) {
      throw new Error(
        'API_URL environment variable is not defined for Ebirr callback',
      );
    }
    const callbackUrl = `${process.env.API_URL}/api/callbacks/ebirr/finish`;
    const customerPrefix = String(ebirrConfig.customerPrefix || '').trim();
    const paymentMethod = String(
      ebirrConfig.paymentMethod || 'MWALLET_ACCOUNT',
    ).trim();

    const payload: any = {
      schemaVersion: '1.0',
      requestId: requestId,
      timestamp: timestamp,
      channelName: 'WEB',
      serviceName: 'API_PURCHASE',
      serviceParams: {
        merchantUid: ebirrConfig.merchantUid,
        paymentMethod,
        apiKey: ebirrConfig.apiKey,
        apiUserId: ebirrConfig.apiUserId,
        ...(customerPrefix ? { prefix: customerPrefix } : {}),
        // returnUrl: defined below
        payerInfo: {
          accountNo: formattedPhone,
          ...(customerPrefix ? { prefix: customerPrefix } : {}),
        },
        transactionInfo: {
          referenceId: referenceId,
          invoiceId: invoiceId,
          amount: amount,
          currency: 'ETB',
          description: description || 'Suuq Order',
        },
      },
    };

    if (process.env.EBIRR_USE_CALLBACK === 'true') {
      payload.serviceParams.returnUrl = callbackUrl;
    }

    this.logger.log(
      `Initiating Ebirr payment with payload: ${JSON.stringify(this.redactForLogs(payload))}`,
    );

    // Create initial transaction record
    const transaction = this.ebirrTransactionRepo.create({
      merch_order_id: referenceId,
      invoiceId: invoiceId,
      payer_name: 'Unknown', // Ebirr API doesn't require name in request
      payer_account: formattedPhone,
      amount: parseFloat(amount),
      currency: 'ETB',
      req_transaction_id: requestId,
      request_timestamp: timestamp,
      raw_request_payload: payload,
      status: 'PENDING',
    });

    try {
      await this.ebirrTransactionRepo.save(transaction);

      const response = await axios.post(ebirrConfig.baseUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      });

      this.logger.log(
        `Ebirr payment success: ${JSON.stringify(response.data)}`,
      );

      // Handle soft errors (HTTP 200 but API error)
      const data = response.data;
      if (data && data.errorCode && String(data.errorCode) !== '0') {
        transaction.status = 'FAILED';
        transaction.raw_response_payload = data;
        transaction.response_code = data.errorCode;
        transaction.response_msg = data.responseMsg || data.message;
        await this.ebirrTransactionRepo.save(transaction);

        let friendlyMsg = data.responseMsg || 'Unknown error';
        const codeStr = String(data.errorCode);
        const expectedDeclineTag =
          codeStr === '5310'
            ? 'EBIRR_EXPECTED_DECLINE_5310_USER_REJECTED'
            : codeStr === '5309'
              ? 'EBIRR_EXPECTED_DECLINE_5309_INSUFFICIENT_BALANCE'
              : codeStr === 'E10205'
                ? 'EBIRR_EXPECTED_DECLINE_E10205_INSUFFICIENT_BALANCE'
                : null;

        if (codeStr === '5310') {
          friendlyMsg = 'Payment declined. Ensure the SIM is in your device.';
          this.logger.warn(
            `Ebirr expected decline: ${JSON.stringify({ telemetryTag: expectedDeclineTag, expectedDecline: true, provider: 'EBIRR', providerCode: codeStr, orderId, referenceId, requestId, message: friendlyMsg })}`,
          );
        } else if (codeStr === '5309') {
          friendlyMsg = 'Insufficient balance in your Ebirr account.';
          this.logger.warn(
            `Ebirr expected decline: ${JSON.stringify({ telemetryTag: expectedDeclineTag, expectedDecline: true, provider: 'EBIRR', providerCode: codeStr, orderId, referenceId, requestId, message: friendlyMsg })}`,
          );
        } else if (codeStr === 'E10205') {
          friendlyMsg = 'Insufficient balance in your Ebirr account.';
          this.logger.warn(
            `Ebirr expected decline: ${JSON.stringify({ telemetryTag: expectedDeclineTag, expectedDecline: true, provider: 'EBIRR', providerCode: codeStr, orderId, referenceId, requestId, message: friendlyMsg })}`,
          );
        } else {
          // Log other upstream errors as errors
          this.logger.error(
            `Ebirr Upstream Error (Order: ${orderId}, Code: ${codeStr}): ${friendlyMsg}`,
          );
        }

        const attemptNo = await this.ebirrTransactionRepo.count({
          where: { merch_order_id: referenceId },
        });
        const err: any = new Error(`${friendlyMsg} (Code: ${data.errorCode})`);
        err.isHandled = true;
        err.provider = 'EBIRR';
        err.providerCode = codeStr;
        err.expectedDecline = expectedDeclineTag !== null;
        err.telemetryTag = expectedDeclineTag || undefined;
        err.providerRef = requestId;
        err.orderId = orderId;
        err.referenceId = referenceId;
        err.attemptNo = attemptNo;
        err.latencyMs = Date.now() - startedAt;
        throw err;
      }

      // Update transaction with success response
      transaction.status = 'INITIATED'; // Request accepted
      transaction.raw_response_payload = response.data;
      if (response.data && response.data.responseCode) {
        transaction.response_code = response.data.responseCode;
        transaction.response_msg = response.data.responseMsg;
      }
      await this.ebirrTransactionRepo.save(transaction);

      return response.data;
    } catch (error: any) {
      if (error.isHandled) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Ebirr payment failed handling: ${error.message}`,
          error.response?.data,
        );

        // Update transaction with failure details
        transaction.status = 'FAILED';
        transaction.raw_response_payload = error.response?.data || {
          message: error.message,
        };
        await this.ebirrTransactionRepo.save(transaction);

        throw new Error(
          `Ebirr payment failed: ${JSON.stringify(error.response?.data || error.message)}`,
        );
      }

      this.logger.error('Ebirr payment unexpected error', error);

      transaction.status = 'ERROR';
      transaction.raw_response_payload = { message: error.message };
      await this.ebirrTransactionRepo.save(transaction);

      throw error;
    }
  }

  async checkOrderStatus(orderId: string) {
    const numericOrderId = parseInt(orderId, 10);
    const order = await this.orderRepo.findOne({
      where: { id: numericOrderId },
    });
    if (!order) {
      throw new BadRequestException('Order not found');
    }

    const latestTx = await this.ebirrTransactionRepo.findOne({
      where: [
        { invoiceId: `INV-${numericOrderId}` },
        { invoiceId: String(numericOrderId) },
        { merch_order_id: `REF-${numericOrderId}` },
      ],
      order: { created_at: 'DESC' },
    });

    const paymentLifecycleState = this.derivePaymentLifecycleStateForSync({
      order,
      transactionStatus: latestTx?.status || null,
      transactionUpdatedAt: latestTx?.updated_at || null,
    });

    const rawResponse = (latestTx?.raw_response_payload || {}) as Record<
      string,
      any
    >;
    const checkoutUrl =
      typeof rawResponse?.toPayUrl === 'string' && rawResponse.toPayUrl.trim()
        ? rawResponse.toPayUrl.trim()
        : null;
    const receiveCode =
      typeof rawResponse?.receiverCode === 'string' &&
      rawResponse.receiverCode.trim()
        ? rawResponse.receiverCode.trim()
        : typeof rawResponse?.ussd === 'string' && rawResponse.ussd.trim()
          ? rawResponse.ussd.trim()
          : null;
    const providerMessage =
      latestTx?.response_msg ||
      rawResponse?.responseMsg ||
      rawResponse?.message ||
      (paymentLifecycleState === 'FAILED'
        ? null
        : checkoutUrl || receiveCode
          ? 'Continue the EBIRR confirmation using the provided handoff. The PIN prompt comes from the wallet flow, not from the app UI.'
          : 'A payment request has been sent to the mobile wallet/SIM for the entered number. Confirm the provider PIN prompt on that line; the app cannot display the EBIRR popup by itself.');
    const status =
      paymentLifecycleState === 'PAID'
        ? 'PAID'
        : paymentLifecycleState === 'FAILED'
          ? 'FAILED'
          : 'PENDING';

    return {
      paymentStatus: order.paymentStatus,
      status,
      orderStatus: order.status,
      provider: 'EBIRR',
      paymentLifecycleState,
      checkoutUrl,
      receiveCode,
      providerMessage,
      transaction: latestTx
        ? {
            status: latestTx.status,
            referenceId: latestTx.merch_order_id,
            invoiceId: latestTx.invoiceId,
            requestId: latestTx.req_transaction_id,
            transactionId: latestTx.trans_id || null,
            issuerTransactionId: latestTx.issuer_trans_id || null,
            responseCode: latestTx.response_code || null,
            responseMessage: latestTx.response_msg || null,
            updatedAt: latestTx.updated_at,
          }
        : null,
    };
  }

  async processCallback(payload: any) {
    // Ebirr payload structure usually contains referenceId or issuerTransactionId
    // Example: { referenceId: '...', status: 'Paid', ... }

    // Attempt to match by referenceId (Suuq_...)
    const refId = payload.referenceId || payload.merch_order_id;
    if (!refId) {
      this.logger.warn('Ebirr Callback received without referenceId');
      return;
    }

    const tx = await this.ebirrTransactionRepo.findOne({
      where: { merch_order_id: refId },
    });
    if (!tx) {
      this.logger.warn(
        `Ebirr Callback: Transaction not found for ref ${refId}`,
      );
      return;
    }

    if (tx.status === 'COMPLETED') {
      this.logger.warn(
        `Ebirr Callback duplicate ignored for completed transaction ref ${refId}`,
      );
      return;
    }

    tx.raw_response_payload = { ...tx.raw_response_payload, callback: payload };

    // Check various success indicators
    const isSuccess =
      payload.status === 'Paid' ||
      payload.responseCode === '0' ||
      String(payload.code) === '0';

    if (isSuccess) {
      tx.status = 'COMPLETED';
      if (payload.transactionId) tx.trans_id = payload.transactionId;
      if (payload.issuerTransactionId)
        tx.issuer_trans_id = payload.issuerTransactionId;
      await this.ebirrTransactionRepo.save(tx);

      if (tx.invoiceId) {
        const matches = String(tx.invoiceId).match(/(\d+)/);
        const orderId = matches?.[0] ? parseInt(matches[0], 10) : NaN;
        if (!orderId || isNaN(orderId)) {
          this.logger.error(
            `Ebirr callback could not parse orderId from invoiceId=${tx.invoiceId}`,
          );
          return;
        }
        try {
          await this.ordersService.completeOrderFromPaymentCallback(orderId);
        } catch (error) {
          this.logger.error(
            `Failed to complete order ${orderId} in Ebirr callback: ${error.message}`,
          );
        }
      }
    } else {
      tx.status = 'FAILED';
      await this.ebirrTransactionRepo.save(tx);
    }
  }

  async verifyReturnCallback(query: any): Promise<{
    accepted: boolean;
    orderId: number | null;
    referenceId: string | null;
    reason?: string;
  }> {
    const refId =
      query?.referenceId || query?.refId || query?.ReferenceId || query?.ref;

    if (!refId || typeof refId !== 'string') {
      return {
        accepted: false,
        orderId: null,
        referenceId: null,
        reason: 'missing_reference_id',
      };
    }

    const tx = await this.ebirrTransactionRepo.findOne({
      where: { merch_order_id: refId },
      order: { created_at: 'DESC' },
    });

    if (!tx) {
      return {
        accepted: false,
        orderId: null,
        referenceId: refId,
        reason: 'transaction_not_found',
      };
    }

    const refOrderMatch = String(refId).match(/(\d+)/);
    const refOrderId = refOrderMatch?.[0]
      ? parseInt(refOrderMatch[0], 10)
      : NaN;
    const invoiceOrderMatch = String(tx.invoiceId || '').match(/(\d+)/);
    const invoiceOrderId = invoiceOrderMatch?.[0]
      ? parseInt(invoiceOrderMatch[0], 10)
      : NaN;

    const orderId =
      !isNaN(invoiceOrderId) && invoiceOrderId > 0
        ? invoiceOrderId
        : !isNaN(refOrderId) && refOrderId > 0
          ? refOrderId
          : null;

    if (
      !isNaN(refOrderId) &&
      refOrderId > 0 &&
      !isNaN(invoiceOrderId) &&
      invoiceOrderId > 0 &&
      refOrderId !== invoiceOrderId
    ) {
      this.logger.error(
        `Ebirr return callback rejected: ref/order mismatch refId=${refId} refOrderId=${refOrderId} invoiceOrderId=${invoiceOrderId}`,
      );
      return {
        accepted: false,
        orderId,
        referenceId: refId,
        reason: 'reference_invoice_mismatch',
      };
    }

    tx.raw_response_payload = {
      ...(tx.raw_response_payload || {}),
      returnCallback: query,
      returnCallbackVerifiedAt: new Date().toISOString(),
    };
    await this.ebirrTransactionRepo.save(tx);

    return {
      accepted: true,
      orderId,
      referenceId: refId,
    };
  }

  async reconcileStuckInitiatedTransactions(params?: {
    olderThanMinutes?: number;
    limit?: number;
    dryRun?: boolean;
  }): Promise<{
    scanned: number;
    completed: number;
    expired: number;
    dryRun: boolean;
    items: Array<{
      txId: number;
      referenceId: string;
      invoiceId: string | null;
      previousStatus: string;
      nextStatus: string;
      reason: string;
      orderId: number | null;
    }>;
  }> {
    const olderThanMinutes = Math.max(
      1,
      Number(params?.olderThanMinutes || 30),
    );
    const limit = Math.min(500, Math.max(1, Number(params?.limit || 100)));
    const dryRun = Boolean(params?.dryRun);

    const threshold = subMinutes(new Date(), olderThanMinutes);
    const transactions = await this.ebirrTransactionRepo.find({
      where: {
        status: 'INITIATED',
        updated_at: LessThan(threshold),
      },
      order: {
        updated_at: 'ASC',
      },
      take: limit,
    });

    let completed = 0;
    let expired = 0;
    const items: Array<{
      txId: number;
      referenceId: string;
      invoiceId: string | null;
      previousStatus: string;
      nextStatus: string;
      reason: string;
      orderId: number | null;
    }> = [];

    for (const tx of transactions) {
      const previousStatus = tx.status;
      const invoiceMatch = String(tx.invoiceId || '').match(/(\d+)/);
      const orderId = invoiceMatch?.[0] ? parseInt(invoiceMatch[0], 10) : null;

      let nextStatus: string = 'EXPIRED';
      let reason = 'Admin reconciliation: payment not confirmed in time';

      if (orderId) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (order?.paymentStatus === PaymentStatus.PAID) {
          nextStatus = 'COMPLETED';
          reason = 'Admin reconciliation: linked order already PAID';
        }
      }

      if (!dryRun) {
        tx.status = nextStatus;
        tx.response_msg = reason;
        await this.ebirrTransactionRepo.save(tx);
      }

      if (nextStatus === 'COMPLETED') completed += 1;
      if (nextStatus === 'EXPIRED') expired += 1;

      items.push({
        txId: tx.id,
        referenceId: tx.merch_order_id,
        invoiceId: tx.invoiceId || null,
        previousStatus,
        nextStatus,
        reason,
        orderId,
      });
    }

    return {
      scanned: transactions.length,
      completed,
      expired,
      dryRun,
      items,
    };
  }
}
