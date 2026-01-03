import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import * as util from 'util';
import * as dotenv from 'dotenv';

dotenv.config();

const exec = util.promisify(child_process.exec);

async function backup() {
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

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `backup-${timestamp}.sql.gz`;
  const backupPath = path.join('/tmp', backupFilename);

  console.log('Starting database backup (PostgreSQL)...');

  let dbCmd = '';
  const env = { ...process.env };

  if (process.env.DATABASE_URL) {
    // pg_dump can accept the connection string directly
    dbCmd = `pg_dump "${process.env.DATABASE_URL}" | gzip > "${backupPath}"`;
  } else {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '5432';
    const user = process.env.DB_USERNAME || 'postgres';
    const pass = process.env.DB_PASSWORD || '';
    const db = process.env.DB_DATABASE || 'suuq';

    // Pass password via environment variable to avoid prompt
    env['PGPASSWORD'] = pass;
    dbCmd = `pg_dump -h ${host} -p ${port} -U ${user} ${db} | gzip > "${backupPath}"`;
  }

  try {
    // Execute pg_dump
    await exec(dbCmd, { env });
    console.log(`Backup created at ${backupPath}`);

    // Upload to Spaces
    console.log('Uploading to Spaces...');
    const fileStream = fs.createReadStream(backupPath);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `backups/${backupFilename}`,
        Body: fileStream,
        ACL: 'private', // Backups should be private
      }),
    );

    console.log(
      `Backup uploaded to spaces://${bucket}/backups/${backupFilename}`,
    );

    // Cleanup
    fs.unlinkSync(backupPath);
    console.log('Local backup file removed.');
  } catch (error) {
    console.error('Backup failed:', error);
    if ((error as any).stderr) {
      console.error('Stderr:', (error as any).stderr);
    }
    process.exit(1);
  }
}

backup();
