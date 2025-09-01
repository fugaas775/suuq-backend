import { Module, Global, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs'; // Import the File System module

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'FIREBASE_ADMIN',
      useFactory: () => {
        const logger = new Logger('FirebaseModule');

        const serviceAccountPath = path.join(
          __dirname,
          '..',
          'config',
          'firebase-service-account.json',
        );

        try {
          // Read the file's contents as a string
          const serviceAccountFile = fs.readFileSync(
            serviceAccountPath,
            'utf8',
          );
          // Parse the string into a JSON object
          const serviceAccount = JSON.parse(
            serviceAccountFile,
          ) as ServiceAccount;

          if (!admin.apps.length) {
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
            });
            logger.log('Firebase Admin initialized successfully.');
          }
          return admin;
        } catch (error: unknown) {
          logger.error(
            `CRITICAL: Failed to load or parse Firebase service account from: ${serviceAccountPath}.`,
            error instanceof Error ? error.stack : undefined,
          );
          throw new Error('Could not initialize Firebase Admin SDK.');
        }
      },
    },
  ],
  exports: ['FIREBASE_ADMIN'],
})
export class FirebaseModule {}
