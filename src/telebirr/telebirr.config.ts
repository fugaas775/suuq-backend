import * as dotenv from 'dotenv';
dotenv.config({ quiet: true });

export const telebirrConfig = {
  appKey: process.env.TELEBIRR_APP_KEY,
  appId: process.env.TELEBIRR_APP_ID,
  publicKey: process.env.TELEBIRR_PUBLIC_KEY,
  notifyUrl: process.env.TELEBIRR_NOTIFY_URL,
  apiUrl:
    process.env.TELEBIRR_API_URL ||
    'https://app.telebirr.com/service-open-up/gateway',
};
