import 'dotenv/config';
import dataSource from '../src/data-source';
import * as fs from 'fs';
import * as path from 'path';
import {
  PayoutLog,
  PayoutStatus,
} from '../src/wallet/entities/payout-log.entity';

// Ensure we fail on unhandled rejections
process.on('unhandledRejection', (up) => {
  throw up;
});

async function run() {
  console.log('Connecting to database...');
  await dataSource.initialize();

  const payoutRepo = dataSource.getRepository(PayoutLog);

  console.log('Fetching PENDING payouts...');
  const payouts = await payoutRepo.find({
    where: { status: PayoutStatus.PENDING },
    relations: ['vendor'], // Make sure to load vendor
    order: { createdAt: 'ASC' },
  });

  if (payouts.length === 0) {
    console.log('No pending payouts found.');
    await dataSource.destroy();
    return;
  }

  console.log(`Found ${payouts.length} pending payouts.`);

  const header = [
    'Payout ID',
    'Vendor ID',
    'Vendor Name',
    'Vendor Phone',
    'Amount',
    'Currency',
    'Provider',
    'System Ref',
    'Created At',
  ].join(',');

  const rows = payouts.map((p) => {
    // Fallback logic for name
    const v = p.vendor || {};
    const nameStr = (
      v['legalName'] ||
      v['storeName'] ||
      v['displayName'] ||
      v['email'] ||
      'Unknown'
    ).toString();
    const name = `"${nameStr.trim().replace(/"/g, '""')}"`;

    // Fallback logic for phone (User entity might have vendorPhoneNumber or phoneNumber)
    const phone = (v['vendorPhoneNumber'] || v['phoneNumber'] || '').toString();

    return [
      p.id,
      v.id,
      name,
      phone,
      p.amount,
      p.currency,
      p.provider || 'EBIRR',
      p.transactionReference,
      p.createdAt.toISOString(),
    ].join(',');
  });

  const csvContent = [header, ...rows].join('\n');
  const filename = `payouts-${new Date().toISOString().slice(0, 10)}.csv`;
  const filePath = path.join(process.cwd(), filename);

  fs.writeFileSync(filePath, csvContent);
  console.log(`Successfully wrote CSV to: ${filePath}`);

  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
