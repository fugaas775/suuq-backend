import * as dotenv from 'dotenv';
dotenv.config();

export const mpesaConfig = {
  consumerKey: process.env.MPESA_CONSUMER_KEY!,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
  shortCode: process.env.MPESA_SHORT_CODE!,
  passkey: process.env.MPESA_PASSKEY!,
  callbackUrl: process.env.MPESA_CALLBACK_URL!,
  baseUrl: process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke',
};
