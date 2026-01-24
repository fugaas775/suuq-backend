import { Client } from 'pg';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
    host: 'localhost',
    user: 'suuquser',
    password: process.env.DB_PASSWORD || 'wDaUYUrxNKtII8hh',
    database: 'suuqdb',
};

async function auditIcons() {
    // 1. Setup DB Connection
    const client = new Client(dbConfig);
    await client.connect();

    // 2. Setup S3 Connection
    const bucket = process.env.DO_SPACES_BUCKET;
    const region = process.env.DO_SPACES_REGION;
    const endpoint = process.env.DO_SPACES_ENDPOINT;
    const key = process.env.DO_SPACES_KEY;
    const secret = process.env.DO_SPACES_SECRET;

    if (!bucket || !endpoint || !key || !secret) {
        console.error('Missing Spaces (S3) configuration in .env');
        process.exit(1);
    }

    const s3 = new S3Client({
        endpoint,
        region,
        forcePathStyle: false,
        credentials: { accessKeyId: key, secretAccessKey: secret },
    });

    try {
        // 3. Fetch all categories with iconUrl
        console.log('Fetching categories...');
        const res = await client.query('SELECT id, name, "iconUrl" FROM category WHERE "iconUrl" IS NOT NULL');
        
        console.log(`Found ${res.rows.length} categories with icons.`);
        
        let missingCount = 0;
        let foundCount = 0;

        for (const cat of res.rows) {
            let iconUrl = cat.iconUrl;
            // Extract Key from URL
            // URL format: https://bucket.endpoint/Key?v=x
            // Or sometimes: https://endpoint/bucket/Key (if path style)
            // But we saw: https://suuq-media.ams3.digitaloceanspaces.com/full_...
            
            // We can match after digitaloceanspaces.com/
            // Note: The URL in DB seems to be fully formed.
            
            let objKey = '';
            try {
                const urlObj = new URL(iconUrl);
                // Pathname is /Key
                objKey = urlObj.pathname.substring(1); // remove leading /
                
                // Decode URI component because S3 keys are stored decoded, but URL is encoded?
                // Wait, if the URL in DB is "Garden & Outdoor Supplies.png", it is NOT encoded. 
                // But valid URL must be encoded. 
                // The psql output showed "Garden & Outdoor Supplies.png" (raw/decoded).
                // Let's assume the Key is exactly what's in the path, but we might need to decode it if it WAS encoded.
                objKey = decodeURIComponent(objKey);

            } catch (e) {
                console.warn(`[${cat.id}] Invalid URL: ${iconUrl}`);
                missingCount++;
                continue;
            }

            try {
                await s3.send(new HeadObjectCommand({
                    Bucket: bucket,
                    Key: objKey
                }));
                // console.log(`[${cat.id}] OK: ${cat.name}`);
                foundCount++;
            } catch (err: any) {
                if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404 || err.$metadata?.httpStatusCode === 403) {
                    // 403 often means 404 in S3 if no list permission, but we have list permission.
                    // Actually, 403 can happen if key doesn't exist.
                    console.log(`[${cat.id}] MISSING: ${cat.name} -> Key: "${objKey}"`);
                    missingCount++;
                } else {
                    console.error(`[${cat.id}] ERROR: ${cat.name}`, err.name);
                    missingCount++;
                }
            }
        }
        
        console.log('------------------------------------------------');
        console.log(`Audit Complete. Found: ${foundCount}, Missing: ${missingCount}`);

    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        await client.end();
    }
}

auditIcons();
