import { S3Client, ListObjectVersionsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
dotenv.config();

async function restoreDeletedFiles() {
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

  console.log('Scanning for deleted files...');
  
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  let restoredCount = 0;

  do {
    const command = new ListObjectVersionsCommand({
      Bucket: bucket,
      KeyMarker: keyMarker,
      VersionIdMarker: versionIdMarker,
    });
    
    // Spaces might not support all params perfectly, but standard S3 does.
    const response = await s3.send(command).catch(e => {
        console.error("List versions failed", e);
        return null;
    });

    if (!response) break;

    const markers = response.DeleteMarkers || [];
    
    for (const marker of markers) {
        if (marker.IsLatest) {
            // Check if this looks like one of our deleted files
            // Pattern: full_..., thumb_..., lowres_...
            if (marker.Key && (marker.Key.startsWith('full_') || marker.Key.startsWith('thumb_') || marker.Key.startsWith('lowres_'))) {
                
                // Optional: Check Date. The cron ran on Jan 18.
                // marker.LastModified is a Date object.
                const delDate = new Date(marker.LastModified!);
                // Check if it's recent (e.g. after Jan 17)
                if (delDate > new Date('2026-01-17')) {
                    console.log(`Restoring: ${marker.Key} (Deleted: ${marker.LastModified})`);
                    
                    try {
                        await s3.send(new DeleteObjectCommand({
                            Bucket: bucket,
                            Key: marker.Key,
                            VersionId: marker.VersionId
                        }));
                        restoredCount++;
                    } catch (e) {
                        console.error(`Failed to restore ${marker.Key}`, e);
                    }
                }
            }
        }
    }

    keyMarker = response.NextKeyMarker;
    versionIdMarker = response.NextVersionIdMarker;
    
    if (!keyMarker) break;

  } while (keyMarker);

  console.log(`Restoration complete. Restored ${restoredCount} files.`);
}

restoreDeletedFiles();
