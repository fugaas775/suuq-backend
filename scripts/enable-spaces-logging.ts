import {
  S3Client,
  PutBucketLoggingCommand,
  PutBucketVersioningCommand,
  PutBucketLifecycleConfigurationCommand,
  BucketVersioningStatus,
} from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

dotenv.config();

async function configureSpaces() {
  const bucket = process.env.DO_SPACES_BUCKET;
  const region = process.env.DO_SPACES_REGION;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;

  if (!bucket || !region || !endpoint || !key || !secret) {
    console.error('Missing DO Spaces configuration');
    process.exit(1);
  }

  const s3 = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId: key,
      secretAccessKey: secret,
    },
  });

  console.log(`Configuring Spaces bucket: ${bucket} in ${region}`);

  try {
    // 1. Enable Logging
    console.log('1. Enabling Bucket Logging...');
    try {
      await s3.send(
        new PutBucketLoggingCommand({
          Bucket: bucket,
          BucketLoggingStatus: {
            LoggingEnabled: {
              TargetBucket: bucket,
              TargetPrefix: 'logs/',
            },
          },
        }),
      );
      console.log('   ✅ Logging enabled to logs/');
    } catch (error) {
      console.warn(
        '   ⚠️  Could not enable logging via API. Please enable it in the DigitalOcean Control Panel if needed.',
      );
    }

    // 2. Enable Versioning
    // Note: Versioning is bucket-wide. It cannot be enabled only for "backups/".
    // This protects against accidental overwrites/deletes but increases storage usage.
    console.log('2. Enabling Bucket Versioning...');
    try {
      await s3.send(
        new PutBucketVersioningCommand({
          Bucket: bucket,
          VersioningConfiguration: {
            Status: BucketVersioningStatus.Enabled,
          },
        }),
      );
      console.log('   ✅ Versioning enabled (Bucket-wide)');
    } catch (error) {
      console.error('Error details:', error);
      console.warn(
        '   ⚠️  Could not enable versioning via API. Please enable it in the DigitalOcean Control Panel.',
      );
    }

    // 3. Set Lifecycle Rules
    console.log('3. Setting Lifecycle Rules...');
    try {
      await s3.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: bucket,
          LifecycleConfiguration: {
            Rules: [
              {
                ID: 'Delete-Logs-After-30-Days',
                Status: 'Enabled',
                Prefix: 'logs/',
                Expiration: {
                  Days: 30,
                },
              },
              {
                ID: 'Expire-Old-Versions-Backups',
                Status: 'Enabled',
                Prefix: 'backups/',
                NoncurrentVersionExpiration: {
                  NoncurrentDays: 30, // Keep old versions of backups for 30 days, then delete
                },
              },
            ],
          },
        }),
      );
      console.log('   ✅ Lifecycle rules set:');
      console.log('      - logs/ deleted after 30 days');
      console.log('      - backups/ old versions deleted after 30 days');
    } catch (error) {
      console.error('Error details:', error);
      console.warn(
        '   ⚠️  Could not set lifecycle rules via API. Please configure them in the DigitalOcean Control Panel.',
      );
    }
  } catch (error) {
    console.error('Failed to configure Spaces:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
  }
}

configureSpaces();
