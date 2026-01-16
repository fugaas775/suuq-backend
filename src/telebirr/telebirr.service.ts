import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { telebirrConfig } from './telebirr.config';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class TelebirrService {
  private readonly logger = new Logger(TelebirrService.name);
  private fabricToken: string | null = null;
  private tokenExpiry: number = 0;

  async getFabricToken(): Promise<string> {
    if (this.fabricToken && Date.now() < this.tokenExpiry) {
      return this.fabricToken;
    }

    try {
      // Endpoint logic for Fabric Token
      const response = await axios.post(
        `${telebirrConfig.apiUrl}/payment/v1/token`, 
        {
          appId: telebirrConfig.appId,
          appKey: telebirrConfig.appKey, 
        },
      );

      const data = response.data;
      if (data.code !== 0 && data.code !== 200) {
         this.logger.error(`Fabric token error: ${JSON.stringify(data)}`);
         throw new Error('Failed to obtain Fabric token');
      }

      this.fabricToken = data.data.accessToken; 
      const expr = parseInt(data.data.expiresIn) || 3600; 
      this.tokenExpiry = Date.now() + (expr * 1000) - 60000;
      
      return this.fabricToken;
    } catch (error) {
      this.logger.error('Error fetching Fabric token', error);
      throw new InternalServerErrorException('Failed to authenticate with Payment Gateway');
    }
  }

  private createStringA(params: Record<string, any>): string {
    return Object.keys(params)
      .sort()
      .filter((key) => params[key] !== null && params[key] !== undefined && params[key] !== '' && key !== 'sign')
      .map((key) => `${key}=${params[key]}`)
      .join('&');
  }

  signRequest(params: Record<string, any>): string {
    const stringA = this.createStringA(params);
    const sign = crypto.createSign('SHA256');
    sign.update(stringA);
    sign.end();
    return sign.sign(telebirrConfig.privateKey, 'base64');
  }

  encryptPayload(payload: Record<string, any>): string {
    const jsonStr = JSON.stringify(payload);
    const buffer = Buffer.from(jsonStr, 'utf8');
    const encrypted = crypto.publicEncrypt(
      {
        key: telebirrConfig.publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      buffer,
    );
    return encrypted.toString('base64');
  }

  async createOrder(
    amount: string,
    merchOrderId: string,
  ): Promise<any> {
    const token = await this.getFabricToken(); 

    const ussdPayload = {
      outTradeNo: merchOrderId,
      subject: `Order ${merchOrderId}`,
      totalAmount: amount,
      shortCode: telebirrConfig.shortCode,
      notifyUrl: telebirrConfig.notifyUrl,
      returnUrl: 'suuq://payment_success', // Placeholder
      receiveName: 'Suuq',
      appId: telebirrConfig.appId,
      timeoutExpress: '30m',
      timestamp: Date.now().toString(),
      nonce: crypto.randomBytes(16).toString('hex'),
    };

    const ussd = this.encryptPayload(ussdPayload);

    const requestBody = {
      appId: telebirrConfig.appId,
      ussd: ussd,
      sign: '',
    };
    
    requestBody.sign = this.signRequest(requestBody);

    try {
      const response = await axios.post(
        `${telebirrConfig.apiUrl}/payment/v1/toPay`, 
        requestBody,
        { headers: { 'X-Auth-Token': token } }
      );

      if (response.data.code !== 0 && response.data.code !== 200) {
         this.logger.error(`Telebirr createOrder failed: ${JSON.stringify(response.data)}`);
         throw new Error(response.data.msg || 'Telebirr API Error');
      }
      
      // Return the data that contains toPayUrl or receiveCode 
      return response.data.data; 
    } catch (error) {
      this.logger.error('Error creating Telebirr order', error);
      throw new InternalServerErrorException('Payment initiation failed');
    }
  }

  async createDisburseOrder(
    vendorAccount: string,
    amount: string,
    refId: string, // Unique reference for disbursement
  ): Promise<any> {
    const token = await this.getFabricToken();
    
    // Construct payload per standard disburse/B2C API patterns
    const payload = {
      appId: telebirrConfig.appId,
      sign: '',
      ussd: ''
    };

    const ussdData = {
        outTradeNo: refId,
        amount: amount,
        receiverShortCode: vendorAccount, // Or msisdn depending on account type
        remark: 'Vendor Settlement',
        timestamp: Date.now().toString(),
        nonce: crypto.randomBytes(16).toString('hex'),
    };

    const ussd = this.encryptPayload(ussdData);
    payload.ussd = ussd;
    payload.sign = this.signRequest(payload); 
    
    try {
      // Endpoint assumption: /payment/v1/merchant/transfer or similar. 
      // User prompt called it "CreateDisburseOrder".
      const response = await axios.post(
        `${telebirrConfig.apiUrl}/payment/v1/merchant/transfer`, 
        payload,
        { headers: { 'X-Auth-Token': token } }
      );

      if (response.data.code !== 0 && response.data.code !== 200) {
          this.logger.error(`Disbursement failed: ${JSON.stringify(response.data)}`);
          throw new Error(response.data.msg || 'Disbursement Failed');
      }
      return response.data;
    } catch (error) {
       this.logger.error('Error processing disbursement', error);
       throw new InternalServerErrorException('Disbursement failed');
    }
  }

  async queryOrder(merchOrderId: string): Promise<any> {
      const token = await this.getFabricToken();
      const payload = {
          appId: telebirrConfig.appId,
          outTradeNo: merchOrderId,
          sign: ''
      };
      payload.sign = this.signRequest(payload);

      try {
          const response = await axios.post(
              `${telebirrConfig.apiUrl}/payment/v1/queryOrder`,
              payload,
              { headers: { 'X-Auth-Token': token } }
          );
           if (response.data.code !== 0 && response.data.code !== 200) {
              throw new Error(response.data.msg || 'Query Failed');
           }
           return response.data;
      } catch (error) {
          this.logger.error('Error querying order', error);
          throw new InternalServerErrorException('Order query failed');
      }
  }

  verifySignature(data: Record<string, any>): boolean {
    const { sign: signature, ...rest } = data;
    if (!signature) return false;

    const stringA = this.createStringA(rest);
    const verifier = crypto.createVerify('SHA256');
    verifier.update(stringA);
    verifier.end();

    try {
      return verifier.verify(telebirrConfig.publicKey, signature, 'base64');
    } catch (e) {
      this.logger.error('Signature verification failed', e);
      return false;
    }
  }
}
