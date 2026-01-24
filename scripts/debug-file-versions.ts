import { S3Client, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkVersions() {
  const bucket = process.env.DO_SPACES_BUCKET;
  const region = process.env.DO_SPACES_REGION;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;

  const s3 = new S3Client({
    endpoint,
    region,
    forcePathStyle: false,
    credentials: { accessKeyId: key!, secretAccessKey: secret! },
  });

  // This file was confirmed missing in the previous step
  const targetKey = 'full_1755280030994_Cars.png';

  console.log(`Checking versions for: ${targetKey}`);

  try {
    const command = new ListObjectVersionsCommand({
      Bucket: bucket,
      Prefix: targetKey
    });
    const response = await s3.send(command);
    
    console.log('Versions:', response.Versions?.length);
    console.log('DeleteMarkers:', response.DeleteMarkers?.length);

    if (response.Versions) {
        response.Versions.forEach(v => {
            console.log(`Version: ${v.VersionId} - LastModified: ${v.LastModified} - Size: ${v.Size} - IsLatest: ${v.IsLatest}`);
        });
    }
    
    if (response.DeleteMarkers) {
        response.DeleteMarkers.forEach(d => {
            console.log(`DeleteMarker: ${d.VersionId} - LastModified: ${d.LastModified} - IsLatest: ${d.IsLatest}`);
        });
    }

  } catch (error) {
    console.error('Error listing versions:', error);
  }
}

checkVersions();