import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ebirrConfig } from './ebirr.config';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

import { format } from 'date-fns';

@Injectable()
export class EbirrService {
  private readonly logger = new Logger(EbirrService.name);

  constructor(
    @InjectRepository(EbirrTransaction)
    private readonly ebirrTransactionRepo: Repository<EbirrTransaction>,
  ) {}

  /**
   * Simple connectivity check to the configured base URL.
   * Useful for verifying whitelisting and network reachability.
   */
  async checkConnectivity(): Promise<{ success: boolean; status?: number; data?: any }> {
    try {
      this.logger.log(`Checking connectivity to Ebirr at ${ebirrConfig.baseUrl}`);
      
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

    // We point returnUrl to our backend to capture the success and update the database,
    // before redirecting the user back to the app.
    // NOTE: Temporarily removing returnUrl to match the snippet provided by Ebirr Team.
    // If redirects fail, we may need to add this back or configure it in the portal.
    const callbackUrl = process.env.API_URL 
      ? `${process.env.API_URL}/api/callbacks/ebirr/finish` 
      : 'https://api.suuq.ugasfuad.com/api/callbacks/ebirr/finish';

    const payload = {
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
        // returnUrl: callbackUrl, // Commented out to match "working" snippet
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

    this.logger.log(`Initiating Ebirr payment with payload: ${JSON.stringify(payload)}`);

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

      this.logger.log(`Ebirr payment success: ${JSON.stringify(response.data)}`);

      // Update transaction with success response
      transaction.status = 'INITIATED'; // Request accepted
      transaction.raw_response_payload = response.data;
      if (response.data && response.data.responseCode) {
        transaction.response_code = response.data.responseCode;
        transaction.response_msg = response.data.responseMsg;
      }
      await this.ebirrTransactionRepo.save(transaction);

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Ebirr payment failed handling: ${error.message}`,
          error.response?.data,
        );
        
        // Update transaction with failure details
        transaction.status = 'FAILED';
        transaction.raw_response_payload = error.response?.data || { message: error.message };
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
}
