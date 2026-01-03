import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

dotenv.config();

async function testUpload() {
  const bucket = process.env.DO_SPACES_BUCKET;
  const region = process.env.DO_SPACES_REGION;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;

  const s3 = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId: key!,
      secretAccessKey: secret!,
    },
  });

  try {
    console.log('Testing upload...');
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: 'test-upload.txt',
        Body: 'Hello from Suuq Backend!',
        ACL: 'private',
      }),
    );
    console.log('Upload successful!');
  } catch (error) {
    console.error('Upload failed:', error);
  }
}

testUpload();
