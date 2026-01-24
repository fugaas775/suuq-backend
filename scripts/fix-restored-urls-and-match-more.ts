import { Client } from 'pg';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
dotenv.config();

const dbConfig = {
    host:  process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME || 'suuquser',
    password: process.env.DB_PASSWORD || 'wDaUYUrxNKtII8hh',
    database: process.env.DB_DATABASE || 'suuqdb',
};

async function fixAndMatch() {
    const client = new Client(dbConfig);
    await client.connect();

    // 1. Fix double https protocol
    console.log('Fixing double https...');
    await client.query(`
        UPDATE category 
        SET "iconUrl" = REPLACE("iconUrl", 'https://suuq-media.https://', 'https://suuq-media.')
        WHERE "iconUrl" LIKE 'https://suuq-media.https://%'
    `);
    
    // 2. Fetch still missing
    const res = await client.query('SELECT id, name, "iconVersion" FROM category WHERE "iconUrl" IS NULL');
    console.log(`Remaining missing: ${res.rowCount}`);

    if (res.rowCount === 0) {
        await client.end();
        return;
    }

    // 3. List keys again (fast enough)
    const bucket = process.env.DO_SPACES_BUCKET;
    const endpoint = process.env.DO_SPACES_ENDPOINT?.replace('https://', '').replace('http://', ''); // Clean endpoint
    const s3 = new S3Client({
        endpoint: process.env.DO_SPACES_ENDPOINT,
        region: process.env.DO_SPACES_REGION,
        credentials: {
          accessKeyId: process.env.DO_SPACES_KEY!,
          secretAccessKey: process.env.DO_SPACES_SECRET!,
        },
        forcePathStyle: false,
    });

    const allKeys: string[] = [];
    let token: string | undefined;
    do {
        const command = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: 'full_',
            ContinuationToken: token
        });
        const r = await s3.send(command);
        if (r.Contents) r.Contents.forEach(c => c.Key && allKeys.push(c.Key));
        token = r.NextContinuationToken;
    } while (token);

    console.log(`Loaded ${allKeys.length} keys for matching.`);

    for (const row of res.rows) {
        const name = row.name;
        const cleanName = name.replace(/[^\w]/g, '').toLowerCase(); // Remove non-word chars, lowercase

        // Find match where key contains the name (ignoring casing and spaces if possible)
        // Key format: full_123_Name.png
        
        let match = allKeys.find(k => {
            // "full_123_Foo Bar.png"
            // cleanKey -> foobarpng
            const cleanKey = k.toLowerCase().replace(/[^\w]/g, '');
            return cleanKey.includes(cleanName);
        });

        if (match) {
             const version = row.iconVersion || 1;
             const url = `https://${bucket}.${endpoint}/${match}?v=${version}`;
             await client.query('UPDATE category SET "iconUrl" = $1 WHERE id = $2', [url, row.id]);
             console.log(`[FUZZY MATCH] ${name} -> ${url}`);
        } else {
            console.log(`[STILL FAILED] ${name}`);
        }
    }
    
    await client.end();
}

fixAndMatch();
