import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  const bucket = process.env.DO_SPACES_BUCKET;
  const region = process.env.DO_SPACES_REGION;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;

  console.log(`Testing connection to ${bucket} in ${region} at ${endpoint}`);

  const s3 = new S3Client({
    endpoint,
    region,
    forcePathStyle: false,
    credentials: {
      accessKeyId: key!,
      secretAccessKey: secret!,
    },
  });

  try {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 5,
    });
    const response = await s3.send(command);
    console.log('Connection successful!');
    console.log(
      'Objects:',
      response.Contents?.map((c) => c.Key),
    );
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

testConnection();
