import * as dotenv from 'dotenv';
dotenv.config();

export const ebirrConfig = {
  baseUrl: process.env.EBIRR_BASE_URL || 'https://testpayments.ebirr.com',
  // Add other likely credentials as placeholders
  clientId: process.env.EBIRR_CLIENT_ID,
  clientSecret: process.env.EBIRR_CLIENT_SECRET,
  apiKey: process.env.EBIRR_API_KEY,
};
