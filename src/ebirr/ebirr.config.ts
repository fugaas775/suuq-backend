import * as dotenv from 'dotenv';
dotenv.config();

export const ebirrConfig = {
  baseUrl: process.env.EBIRR_BASE_URL || 'https://testpayments.ebirr.com/asm',
  apiKey: process.env.EBIRR_API_KEY,
  merchantUid: process.env.EBIRR_MERCHANT_ID,
  apiUserId: process.env.EBIRR_API_USER_ID,
  customerPrefix: process.env.EBIRR_CUSTOMER_PREFIX,
  paymentMethod: process.env.EBIRR_PAYMENT_METHOD || 'MWALLET_ACCOUNT',
};
