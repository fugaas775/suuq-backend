import { Module, Global, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'FIREBASE_ADMIN',
      useFactory: () => {
        const logger = new Logger('FirebaseModule');
        // Allow disabling in tests/CI
        const disabled =
          process.env.FIREBASE_DISABLED === 'true' ||
          process.env.NODE_ENV === 'test';
        if (disabled) {
          logger.warn('Firebase disabled (test/CI). Using no-op messaging.');
          const mock = {
            messaging: () => ({
              sendEachForMulticast: () =>
                Promise.resolve({
                  successCount: 0,
                  failureCount: 0,
                }),
            }),
          } as unknown as typeof admin;
          return mock;
        }

        // Prefer JSON from env, else fall back to file path
        const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
        const serviceAccountPath =
          process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
          path.join(__dirname, '..', 'config', 'firebase-service-account.json');

        try {
          let serviceAccount: ServiceAccount | null = null;
          if (envJson) {
            serviceAccount = JSON.parse(envJson) as ServiceAccount;
          } else {
            const serviceAccountFile = fs.readFileSync(
              serviceAccountPath,
              'utf8',
            );
            serviceAccount = JSON.parse(serviceAccountFile) as ServiceAccount;
          }
          if (!admin.apps.length) {
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
            });
            logger.log('Firebase Admin initialized successfully.');
          }
          return admin;
        } catch (error: unknown) {
          // Graceful fallback: don't crash the app if Firebase is not configured
          logger.error(
            `Firebase initialization failed. Falling back to no-op messaging. Path tried: ${serviceAccountPath}.`,
            error instanceof Error ? error.stack : undefined,
          );
          const mock = {
            messaging: () => ({
              sendEachForMulticast: () =>
                Promise.resolve({
                  successCount: 0,
                  failureCount: 0,
                }),
            }),
          } as unknown as typeof admin;
          return mock;
        }
      },
    },
  ],
  exports: ['FIREBASE_ADMIN'],
})
export class FirebaseModule {}
