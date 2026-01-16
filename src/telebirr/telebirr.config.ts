import * as dotenv from 'dotenv';
dotenv.config({ quiet: true });

export const telebirrConfig = {
  appKey: process.env.TELEBIRR_APP_KEY,
  appId: process.env.TELEBIRR_APP_ID,
  shortCode: process.env.TELEBIRR_SHORT_CODE,
  publicKey: process.env.TELEBIRR_PUBLIC_KEY,
  privateKey: process.env.TELEBIRR_PRIVATE_KEY,
  notifyUrl: process.env.TELEBIRR_NOTIFY_URL,
  fabricAppId: process.env.TELEBIRR_FABRIC_APP_ID,
  fabricAppSecret: process.env.TELEBIRR_FABRIC_APP_SECRET,
  apiUrl:
    process.env.TELEBIRR_API_URL ||
    'https://telebirrappcube.ethiomobilemoney.et:38443/apiaccess/payment/gateway',
};
