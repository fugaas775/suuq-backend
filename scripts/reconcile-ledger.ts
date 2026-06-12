/**
 * Ledger reconciliation harness (P4 gate).
 *
 * Runs the legacy derived statements and the ledger-computed statements
 * side-by-side for one or more branches and reports any line that diverges
 * beyond tolerance. `cash` and `equity` are exempt by design (the ledger tracks
 * true cash flow; the legacy model estimates cash from register floats).
 *
 * Usage:
 *   yarn reconcile:ledger <branchId[,branchId...]> [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--seed]
 *
 *   --seed   first post the OPENING_BALANCE entry for each branch (as of --to),
 *            then reconcile. Run this once, before live posting, to prime the ledger.
 *
 * Reports a non-zero exit code if any branch fails to reconcile, so it can gate
 * the ACCOUNTING_LEDGER_ENABLED cutover in CI.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LedgerReconciliationService } from '../src/billing/ledger-reconciliation.service';

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flags = new Map<string, string>();
  for (const arg of argv.filter((a) => a.startsWith('--'))) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    flags.set(key, value ?? 'true');
  }
  const branchIds = (positional[0] ?? '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v));
  return {
    branchIds,
    from: flags.get('from') ? new Date(flags.get('from') as string) : null,
    to: flags.get('to') ? new Date(flags.get('to') as string) : new Date(),
    seed: flags.has('seed'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.branchIds.length) {
    console.error(
      'Usage: yarn reconcile:ledger <branchId[,branchId...]> [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--seed]',
    );
    process.exit(2);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const reconciler = app.get(LedgerReconciliationService);

  let failures = 0;
  try {
    for (const branchId of args.branchIds) {
      if (args.seed) {
        const seeded = await reconciler.seedOpeningBalance(branchId, args.to);
        console.log(`[branch ${branchId}] opening balance:`, seeded);
      }
      const result = await reconciler.reconcileBranch(branchId, {
        from: args.from,
        to: args.to,
        asOfAt: args.to,
      });
      const status = result.matched ? 'MATCH ✓' : 'MISMATCH ✗';
      console.log(
        `\n[branch ${branchId}] ${status} (tolerance ${result.tolerance})`,
      );
      console.table(
        result.lines.map((l) => ({
          line: l.line,
          legacy: l.legacy,
          ledger: l.ledger,
          diff: l.diff,
          exempt: l.exempt ? 'exempt' : '',
        })),
      );
      if (!result.matched) failures += 1;
    }
  } finally {
    await app.close();
  }

  if (failures > 0) {
    console.error(`\n${failures} branch(es) failed to reconcile.`);
    process.exit(1);
  }
  console.log('\nAll branches reconciled.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
