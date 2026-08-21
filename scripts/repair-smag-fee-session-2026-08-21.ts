/**
 * One-off correction — SMAG School (#128), register session 524, 2026-08-21.
 *
 * ── What happened ─────────────────────────────────────────────────────────
 * Three siblings of the Wali family paid ETB 500 each towards their fees:
 * Nimco (6aad, SMAG-0077), Muniir (7th, SMAG-0092) and Mucaad (8aad,
 * SMAG-0111). ETB 1,500 was collected. The session recorded ETB 3,000 plus an
 * ETB 2,000 bad-debt write-off.
 *
 * Taking a fee is TWO calls: `POST /pos/v1/checkouts/ingest` books the money
 * (role-gated only) and `PATCH /pos/v1/register/suspended-carts/:id` writes it
 * onto the pupil (permission-gated). The clerk was signed in on an ordinary
 * account session, which carries `roles` but no `permissions` claim, so every
 * one of their folio writes came back 403 while every checkout went through.
 * Five times the money was banked and the roll did not move; the desk saw the
 * full balance still owed and tried again. Later a manager — waved past the
 * permission check by `isManagerLike` — collected a sixth 500 from Muniir and
 * wrote off his remaining 2,000 with the abandoned-job write-off, which
 * discarded his folio and took him off the roll entirely.
 *
 * The 403 itself is fixed in `PosBranchAccessGuard` (a session token with no
 * `permissions` claim now resolves the roster instead of being read as holding
 * none). This script repairs the money and the roll that incident left behind.
 *
 * ── What it does ──────────────────────────────────────────────────────────
 *  1. Voids the three repeat payments and the write-off THROUGH the service,
 *     so each one's ledger entry is reversed rather than left overstating the
 *     school's books. The earliest payment per pupil is the one the parent
 *     actually made and is kept.
 *  2. Writes those three surviving payments onto the folios that refused them.
 *  3. Restores Muniir's folio 17214 — the row from the 2026-08-16 roll import,
 *     the one his admission number, fee schedule and attendance are keyed to.
 *     Its 18:21 replacement (18297) stays discarded: it is a copy, and putting
 *     both back would enrol him twice.
 *
 * Idempotent: a checkout already VOIDED and a folio already carrying its
 * receipt number are both skipped, so a partial run resumes.
 *
 * Usage:
 *   node --env-file=.env -r ts-node/register -r tsconfig-paths/register \
 *     scripts/repair-smag-fee-session-2026-08-21.ts [--apply]
 *
 * Without --apply it reports what it would change and writes nothing.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PosCheckoutService } from '../src/pos-sync/pos-checkout.service';
import {
  PosSuspendedCart,
  PosSuspendedCartStatus,
} from '../src/pos-sync/entities/pos-suspended-cart.entity';
import { PosCheckout } from '../src/pos-sync/entities/pos-checkout.entity';

const BRANCH_ID = 128;

/** The owner, on whose instruction this correction is being made. */
const AUTHORISED_BY_USER_ID = 1863;

/** Checkouts to void: the repeats, and the write-off that followed them. */
const VOIDS: Array<{ id: number; receipt: string; reason: string }> = [
  {
    id: 18293,
    receipt: 'POS-128-1787320521134',
    reason:
      'Duplicate fee payment — Muniir Abdirisaaq Wali (SMAG-0092) paid ETB 500 once, on POS-128-1787320462587. Re-taken because the folio write was refused (403).',
  },
  {
    id: 18294,
    receipt: 'POS-128-1787320658119',
    reason:
      'Duplicate fee payment — Nimco cabdirisaaq Wali (SMAG-0077) paid ETB 500 once, on POS-128-1787319836465. Re-taken because the folio write was refused (403).',
  },
  {
    id: 18297,
    receipt: 'POS-128-1787325849427',
    reason:
      'Duplicate fee payment — Muniir Abdirisaaq Wali (SMAG-0092) paid ETB 500 once, on POS-128-1787320462587. Third attempt at the same payment.',
  },
  {
    id: 18298,
    receipt: 'POS-128-1787325944666',
    reason:
      'Bad-debt write-off taken in error against Muniir Abdirisaaq Wali (SMAG-0092) while his payments were failing to record. Nothing was owed off; his fees stand.',
  },
];

/**
 * The payments that were real, and the folio each one belongs on.
 *
 * `paidAt` is the instant the receipt number was minted (its own trailing
 * milliseconds), so the folio dates the payment to when it was taken rather
 * than to when this repair ran.
 */
const FOLIO_PAYMENTS: Array<{
  folioId: number;
  pupil: string;
  admissionNo: string;
  amount: number;
  receipt: string;
  paidAt: string;
  restoreFromDiscarded?: boolean;
}> = [
  {
    folioId: 17199,
    pupil: 'Nimco cabdirisaaq Wali',
    admissionNo: 'SMAG-0077',
    amount: 500,
    receipt: 'POS-128-1787319836465',
    paidAt: new Date(1787319836465).toISOString(),
  },
  {
    folioId: 17214,
    pupil: 'Muniir Abdirisaaq Wali',
    admissionNo: 'SMAG-0092',
    amount: 500,
    receipt: 'POS-128-1787320462587',
    paidAt: new Date(1787320462587).toISOString(),
    restoreFromDiscarded: true,
  },
  {
    folioId: 17233,
    pupil: 'Mucaad cabdirisaaq Wali',
    admissionNo: 'SMAG-0111',
    amount: 500,
    receipt: 'POS-128-1787320775036',
    paidAt: new Date(1787320775036).toISOString(),
  },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const checkouts: Repository<PosCheckout> = app.get(
      getRepositoryToken(PosCheckout),
    );
    const folios: Repository<PosSuspendedCart> = app.get(
      getRepositoryToken(PosSuspendedCart),
    );
    const checkoutService = app.get(PosCheckoutService);

    console.log(
      `\n=== SMAG #${BRANCH_ID} fee-session repair — ${apply ? 'APPLY' : 'DRY RUN'} ===\n`,
    );

    // ── 1. Void the repeats ───────────────────────────────────────────────
    for (const target of VOIDS) {
      const row = await checkouts.findOne({ where: { id: target.id } });
      if (!row) {
        console.log(
          `  void ${target.id} (${target.receipt}): NOT FOUND — skipped`,
        );
        continue;
      }
      if (row.branchId !== BRANCH_ID) {
        throw new Error(
          `Checkout ${target.id} belongs to branch ${row.branchId}, not ${BRANCH_ID}. Refusing.`,
        );
      }
      if (row.receiptNumber !== target.receipt) {
        throw new Error(
          `Checkout ${target.id} is ${row.receiptNumber}, expected ${target.receipt}. Refusing.`,
        );
      }
      if (String(row.status) === 'VOIDED') {
        console.log(
          `  void ${target.id} (${target.receipt}): already VOIDED — skipped`,
        );
        continue;
      }
      console.log(
        `  void ${target.id} (${target.receipt}) ETB ${row.total} — ${row.status}`,
      );
      if (apply) {
        const result = await checkoutService.voidCheckout(
          target.id,
          { reason: target.reason, authorisedByUserId: AUTHORISED_BY_USER_ID },
          AUTHORISED_BY_USER_ID,
          BRANCH_ID,
        );
        console.log(`       -> ${result.status} at ${result.voidedAt}`);
      }
    }

    // ── 2. Put the surviving payments on the pupils ───────────────────────
    console.log('');
    for (const payment of FOLIO_PAYMENTS) {
      const folio = await folios.findOne({ where: { id: payment.folioId } });
      if (!folio) {
        console.log(
          `  folio ${payment.folioId} (${payment.pupil}): NOT FOUND — skipped`,
        );
        continue;
      }
      if (folio.branchId !== BRANCH_ID) {
        throw new Error(
          `Folio ${payment.folioId} belongs to branch ${folio.branchId}. Refusing.`,
        );
      }
      const snapshot: Record<string, unknown> = {
        ...((folio.cartSnapshot as Record<string, unknown>) ?? {}),
      };
      if (snapshot.schoolAdmissionNo !== payment.admissionNo) {
        throw new Error(
          `Folio ${payment.folioId} is ${String(snapshot.schoolAdmissionNo)}, expected ${payment.admissionNo}. Refusing.`,
        );
      }
      if (snapshot.partialPaymentReceiptNumber === payment.receipt) {
        console.log(
          `  folio ${payment.folioId} (${payment.pupil}): already carries ${payment.receipt} — skipped`,
        );
        continue;
      }

      const wasDiscarded = folio.status === PosSuspendedCartStatus.DISCARDED;
      if (wasDiscarded && !payment.restoreFromDiscarded) {
        throw new Error(
          `Folio ${payment.folioId} is DISCARDED and was not marked for restoration. Refusing.`,
        );
      }

      console.log(
        `  folio ${payment.folioId} (${payment.pupil}, ${payment.admissionNo}): ` +
          `${folio.status}${wasDiscarded ? ' -> SUSPENDED' : ''}, ` +
          `paid ${String((folio.metadata as Record<string, unknown>)?.partialPaidAmount ?? 0)} -> ${payment.amount} ` +
          `of ${folio.total}`,
      );

      if (apply) {
        folio.status = PosSuspendedCartStatus.SUSPENDED;
        folio.metadata = {
          ...((folio.metadata as Record<string, unknown>) ?? {}),
          partialPaidAmount: payment.amount,
        };
        // Mirrors what a successful part-settle PATCH writes: the folio stays
        // unpaid so the pupil keeps their place on the roll with a balance.
        folio.cartSnapshot = {
          ...snapshot,
          paid: false,
          partialPaidAmount: payment.amount,
          partialPaidAt: payment.paidAt,
          partialPaymentReceiptNumber: payment.receipt,
        };
        await folios.save(folio);
        console.log('       -> written');
      }
    }

    // ── 3. Report the session as it now stands ────────────────────────────
    const surviving = await checkouts.find({
      where: { branchId: BRANCH_ID, registerSessionId: 524 },
      order: { createdAt: 'ASC' },
    });
    const live = surviving.filter((c) => String(c.status) !== 'VOIDED');
    // Matches the till's own reading: a receipt tendered ONLY as bad debt
    // banked nothing. An empty tender list is not a write-off, so the length
    // check comes first — `[].every(...)` is true and would count it as one.
    const isWriteOff = (checkout: PosCheckout) => {
      const tenders = checkout.tenders ?? [];
      return (
        tenders.length > 0 &&
        tenders.every((t) => String(t?.method).toUpperCase() === 'BAD_DEBT')
      );
    };
    const collected = live
      .filter((c) => !isWriteOff(c))
      .reduce((sum, c) => sum + Number(c.total || 0), 0);
    const writtenOff = live
      .filter(isWriteOff)
      .reduce((sum, c) => sum + Number(c.total || 0), 0);

    console.log(
      `\n  session 524: ${live.length} live receipts, ETB ${collected} collected, ETB ${writtenOff} written off ` +
        `(${surviving.length - live.length} voided)\n`,
    );

    if (!apply) {
      console.log('  DRY RUN — nothing was written. Re-run with --apply.\n');
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
