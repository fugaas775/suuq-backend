import 'dotenv/config';
import dataSource from '../src/data-source';
import {
  PayoutLog,
  PayoutStatus,
} from '../src/wallet/entities/payout-log.entity';

// Ensure we fail on unhandled rejections
process.on('unhandledRejection', (up) => {
  throw up;
});

async function run() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      'Usage: npx ts-node scripts/mark-payout-paid.ts <PAYOUT_ID> <BANK_REF> [STATUS]',
    );
    console.error(
      'Example: npx ts-node scripts/mark-payout-paid.ts 54 TXN888999 SUCCESS',
    );
    process.exit(1);
  }

  const payoutId = parseInt(args[0], 10);
  const bankRef = args[1];
  const statusRaw = args[2] || 'SUCCESS';

  if (isNaN(payoutId)) {
    console.error('Invalid Payout ID');
    process.exit(1);
  }

  const status = statusRaw.toUpperCase() as PayoutStatus;
  if (!Object.values(PayoutStatus).includes(status)) {
    console.error(
      `Invalid status. Must be one of: ${Object.values(PayoutStatus).join(', ')}`,
    );
    process.exit(1);
  }

  console.log('Connecting to database...');
  await dataSource.initialize();
  const payoutRepo = dataSource.getRepository(PayoutLog);

  const payout = await payoutRepo.findOne({
    where: { id: payoutId },
    relations: ['vendor'],
  });
  if (!payout) {
    console.error(`Payout #${payoutId} not found.`);
    await dataSource.destroy();
    process.exit(1);
  }

  console.log(
    `Updating Payout #${payoutId} for Vendor ${payout.vendor?.id}...`,
  );
  console.log(`Current Status: ${payout.status}`);
  console.log(`New Status:     ${status}`);
  console.log(
    `Reference:      from '${payout.transactionReference}' to '${bankRef}'`,
  );

  payout.status = status;
  payout.transactionReference = bankRef;

  await payoutRepo.save(payout);

  console.log('Update successful.');
  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
