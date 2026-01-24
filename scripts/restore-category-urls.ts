import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const dbConfig = {
    host:  process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME || 'suuquser',
    password: process.env.DB_PASSWORD || 'wDaUYUrxNKtII8hh',
    database: process.env.DB_DATABASE || 'suuqdb',
};

async function restoreCategoryUrls() {
  // 1. Setup connections
  const client = new Client(dbConfig);
  await client.connect();
  
  const bucket = process.env.DO_SPACES_BUCKET;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  
  const s3 = new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: process.env.DO_SPACES_REGION,
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
    },
    forcePathStyle: false,
  });

  console.log('Listing all keys from bucket to rebuild map...');
  
  const allKeys: string[] = [];
  let token: string | undefined;
  
  do {
      const command = new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: 'full_',
          ContinuationToken: token
      });
      const res = await s3.send(command);
      if (res.Contents) {
          res.Contents.forEach(c => c.Key && allKeys.push(c.Key));
      }
      token = res.NextContinuationToken;
  } while (token);
  
  console.log(`Found ${allKeys.length} 'full_' keys.`);

  // 2. Fetch all categories
  const res = await client.query('SELECT id, name, "iconVersion" FROM category WHERE "iconUrl" IS NULL');
  console.log(`Found ${res.rowCount} categories with missing icons.`);
  
  let updated = 0;

  for (const row of res.rows) {
      const name = row.name;
      // Match strategy:
      // Key format: full_TIMESTAMP_NAME.png
      // We look for a key that contains `_${name}.png`.
      
      // Need to handle special regex chars in name if using regex
      // Or just string endsWith
      
      // Try exact string suffix
      let match = allKeys.find(k => k.endsWith(`_${name}.png`));
      
      // Try space variations if not found (e.g. Garden & Outdoor vs Garden &amp; Outdoor?)
      // Actually usually it's just raw name.
      
      if (!match) {
           // Try cleaning name (e.g. remove special chars or try safe matching)
           // But let's log missing ones
           // console.log(`No match for category: ${name}`);
           // matching might fail for "Women's Fashion" if key is "Women's Fashion (Clothing, Shoes).png" ?
           // DB Name: "Women's Fashion (Clothing, Shoes)"
           // Key: "full_..._Women's Fashion (Clothing, Shoes).png"
           // Should work.
           
           // Maybe spaces? 
           // Try checking if name encoded matches?
           
           // Try ignoring spaces in match?
      }

      if (match) {
          const version = row.iconVersion || 1;
          const url = `https://${bucket}.${endpoint}/${match}?v=${version}`;
          
          await client.query('UPDATE category SET "iconUrl" = $1 WHERE id = $2', [url, row.id]);
          console.log(`[RESTORED] ${name} -> ${url}`);
          updated++;
      } else {
          console.log(`[FAILED] Could not match file for: ${name}`);
      }
  }

  console.log(`Restoration DB Update Complete. Updated ${updated} categories.`);
  await client.end();
}

restoreCategoryUrls();
