/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unused-vars */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ebirrConfig } from './ebirr.config';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import {
  Order,
  PaymentStatus,
  OrderStatus,
} from '../orders/entities/order.entity';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Cron, CronExpression } from '@nestjs/schedule';

import { format, subMinutes } from 'date-fns';

@Injectable()
export class EbirrService {
  private readonly logger = new Logger(EbirrService.name);

  constructor(
    @InjectRepository(EbirrTransaction)
    private readonly ebirrTransactionRepo: Repository<EbirrTransaction>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkPendingTransactions() {
    this.logger.log('Checking for pending Ebirr transactions...');
    const tenMinutesAgo = subMinutes(new Date(), 10);

    const pendingTransactions = await this.ebirrTransactionRepo.find({
      where: {
        status: 'PENDING',
        created_at: LessThan(tenMinutesAgo),
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

    let formattedPhone = phoneNumber.replace(/\+/g, '');
    if (formattedPhone.startsWith('09')) {
      formattedPhone = '251' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('9')) {
      formattedPhone = '251' + formattedPhone;
    }

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
          amount: amount.toFixed(2),
          currency: 'ETB',
          description: remark || 'Vendor Payout',
        },
      },
    };

    try {
      this.logger.log(
        `Initiating Ebirr Payout with payload: ${JSON.stringify(payload)}`,
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

    const requestId = `Suuq_${uuidv4()}`;
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

    let formattedPhone = '';
    if (phoneNumber) {
      formattedPhone = phoneNumber.replace(/\+/g, '');
      if (formattedPhone.startsWith('09')) {
        formattedPhone = '251' + formattedPhone.substring(1);
      } else if (formattedPhone.startsWith('9')) {
        formattedPhone = '251' + formattedPhone;
      }
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

    const payload: any = {
      schemaVersion: '1.0',
      requestId: requestId,
      timestamp: timestamp,
      channelName: 'WEB',
      serviceName: 'API_PURCHASE',
      serviceParams: {
        merchantUid: ebirrConfig.merchantUid,
        paymentMethod: 'MWALLET_ACCOUNT',
        apiKey: ebirrConfig.apiKey,
        apiUserId: ebirrConfig.apiUserId,
        // returnUrl: defined below
        payerInfo: {
          accountNo: formattedPhone || '251911223344', // Fallback or strict requirement
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
      `Initiating Ebirr payment with payload: ${JSON.stringify(payload)}`,
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

        if (codeStr === '5310') {
          friendlyMsg = 'Payment was declined by the user on their device.';
          this.logger.warn(
            `Ebirr User Rejection (Order: ${orderId}): ${friendlyMsg}`,
          );
        } else if (codeStr === '5309') {
          friendlyMsg = 'Insufficient balance in your Ebirr account.';
          this.logger.warn(
            `Ebirr Insufficient Balance (Order: ${orderId}): ${friendlyMsg}`,
          );
        } else {
          // Log other upstream errors as errors
          this.logger.error(
            `Ebirr Upstream Error (Order: ${orderId}, Code: ${codeStr}): ${friendlyMsg}`,
          );
        }

        const err: any = new Error(`${friendlyMsg} (Code: ${data.errorCode})`);
        err.isHandled = true;
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
    const order = await this.orderRepo.findOne({
      where: { id: parseInt(orderId) },
    });
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    return {
      paymentStatus: order.paymentStatus,
      status: order.paymentStatus === PaymentStatus.PAID ? 'PAID' : 'PENDING',
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
        const orderId = parseInt(tx.invoiceId);
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (order && order.paymentStatus !== PaymentStatus.PAID) {
          order.paymentStatus = PaymentStatus.PAID;
          order.status = OrderStatus.PROCESSING; // OrderStatus.PAID does not exist, moving to PROCESSING
          await this.orderRepo.save(order);
          this.logger.log(`Order ${orderId} marked as PAID via Ebirr callback`);

          // Emit event: order_paid (Skipped: Socket.io gateway not configured/installed)
        }
      }
    } else {
      tx.status = 'FAILED';
      await this.ebirrTransactionRepo.save(tx);
    }
  }
}
