import { Injectable, Logger } from '@nestjs/common';
import { telebirrConfig } from './telebirr.config';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class TelebirrService {
  private readonly logger = new Logger(TelebirrService.name);

  signRequest(data: string): string {
    // Sign data with Telebirr public key (RSA)
    const buffer = Buffer.from(data);
    const encrypted = crypto.publicEncrypt(
      {
        key: telebirrConfig.publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      buffer,
    );
    return encrypted.toString('base64');
  }

  async createPayment(
    amount: number,
    orderId: number,
    phoneNumber: string,
  ): Promise<string> {
    const { appKey, appId, notifyUrl, apiUrl } = telebirrConfig;
    const payload = {
      appId,
      appKey,
      notifyUrl,
      outTradeNo: `ORDER-${orderId}`,
      subject: `Order #${orderId}`,
      totalAmount: amount,
      shortCode: '', // Add if required by Telebirr
      msisdn: phoneNumber,
    };
    const dataStr = JSON.stringify(payload);
    const sign = this.signRequest(dataStr);
    const requestBody = { ...payload, sign };
    const response = await axios.post(apiUrl, requestBody);
    // Assume response.data.checkoutUrl contains the payment URL
    return response.data.checkoutUrl;
  }
}
