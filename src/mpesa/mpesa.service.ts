import { Injectable, Logger } from '@nestjs/common';
import { mpesaConfig } from './mpesa.config';
import axios from 'axios';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);

  async getAccessToken(): Promise<string> {
    const { consumerKey, consumerSecret, baseUrl } = mpesaConfig;
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const url = `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`;
    const response = await axios.get(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    return response.data.access_token;
  }

  async initiateStkPush(amount: number, phoneNumber: string, orderId: number): Promise<any> {
    const { shortCode, passkey, callbackUrl, baseUrl } = mpesaConfig;
    const accessToken = await this.getAccessToken();
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
    const url = `${baseUrl}/mpesa/stkpush/v1/processrequest`;
    const payload = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: shortCode,
      PhoneNumber: phoneNumber,
      CallBackURL: callbackUrl,
      AccountReference: `ORDER-${orderId}`,
      TransactionDesc: `Order #${orderId}`,
    };
    const response = await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  }
}
