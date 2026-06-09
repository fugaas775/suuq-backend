/**
 * One-time catalog cleanup: convert PROPERTY_RENTAL rate items that were created
 * with a WEEKLY cadence to MONTHLY, WITHOUT changing any price.
 *
 * WHY
 *   The POS derives a property unit's billing cadence from the rate-item product
 *   NAME (e.g. "Two-Bedroom — 1 Week" → weekly). Some units were onboarded with a
 *   weekly product even though their entered price was meant as the monthly rent,
 *   so an 11-month lease billed ~48 weeks. This relabels the cadence to monthly so
 *   the rent line bills in months. The per-unit prices in attributes.propertyUnits
 *   are intentionally left UNTOUCHED (operator confirmed they are monthly rents).
 *
 * SCOPE / SAFETY
 *   - Targets ONLY products that are property-rental rate items, identified by a
 *     non-empty `attributes.propertyUnits` array. HOTEL room products use
 *     `attributes.hotelRooms` (never `propertyUnits`), so HOTEL and every other
 *     service format are structurally out of scope — nothing else is touched.
 *   - Only products whose name still contains a "<n> week(s)" token are matched.
 *   - The original name is saved to `attributes.cadenceOriginalName`, making the
 *     change fully reversible with `--revert`.
 *   - Idempotent: a product already carrying `cadenceOriginalName` is skipped.
 *   - DRY RUN by default. Pass `--execute` to write.
 *
 * USAGE
 *   Dry run (no writes, prints every before → after):
 *     node --env-file=.env -r ts-node/register -r tsconfig-paths/register \
 *       scripts/backfill-property-rental-weekly-to-monthly.ts
 *   Apply:
 *     ... scripts/backfill-property-rental-weekly-to-monthly.ts --execute
 *   Revert (restore the original weekly names):
 *     ... scripts/backfill-property-rental-weekly-to-monthly.ts --revert --execute
 */
import dataSource from '../src/data-source';

const EXECUTE = process.argv.includes('--execute');
const REVERT = process.argv.includes('--revert');

/** Rewrite "<n> Week(s)" → "<n> Month(s)" inside a product name, preserving everything else. */
function toMonthlyName(name: string): string {
  return name.replace(
    /(\d+)(\s*)weeks?\b/gi,
    (_match, count: string, gap: string) =>
      `${count}${gap}Month${Number(count) === 1 ? '' : 's'}`,
  );
}

type Candidate = {
  id: number;
  name: string;
  serviceFormat: string | null;
  units: number;
};

async function runConvert(): Promise<void> {
  // PROPERTY_RENTAL rate items (non-empty propertyUnits) with a weekly name token,
  // not already converted. jsonb_exists() avoids the `?` operator clashing with
  // driver parameter placeholders.
  const rows: Candidate[] = await dataSource.query(
    `SELECT id,
            name,
            attributes->>'serviceFormat'        AS "serviceFormat",
            jsonb_array_length(attributes->'propertyUnits') AS units
       FROM "product"
      WHERE jsonb_exists(attributes, 'propertyUnits')
        AND jsonb_typeof(attributes->'propertyUnits') = 'array'
        AND jsonb_array_length(attributes->'propertyUnits') > 0
        AND name ~* '[0-9]+[[:space:]]*weeks?'
        AND NOT jsonb_exists(attributes, 'cadenceOriginalName')
      ORDER BY id ASC`,
  );

  // Defensive: never touch a HOTEL-tagged product even if it somehow carried
  // propertyUnits. (Structurally impossible today, but cheap insurance.)
  const candidates = rows.filter(
    (r) => String(r.serviceFormat || '').toUpperCase() !== 'HOTEL',
  );

  console.log(
    EXECUTE
      ? 'Executing PROPERTY_RENTAL weekly → monthly cadence conversion (prices unchanged)...'
      : 'Dry run: PROPERTY_RENTAL weekly → monthly cadence conversion (prices unchanged)...',
  );

  if (!candidates.length) {
    console.log('No weekly property-rental rate items found. Nothing to do.');
    return;
  }

  for (const c of candidates) {
    const newName = toMonthlyName(c.name);
    console.log(
      `- productId=${c.id} units=${c.units} serviceFormat=${c.serviceFormat || 'NULL'}\n` +
        `    "${c.name}"\n    → "${newName}"`,
    );
    if (EXECUTE) {
      await dataSource.query(
        `UPDATE "product"
            SET name = $1,
                attributes = jsonb_set(
                               jsonb_set(COALESCE(attributes, '{}'::jsonb),
                                         '{cadenceOriginalName}', to_jsonb($2::text), true),
                               '{billingCycle}', '"MONTH"', true)
          WHERE id = $3`,
        [newName, c.name, c.id],
      );
    }
  }

  console.log(
    EXECUTE
      ? `Done. Converted ${candidates.length} property-rental rate item(s) to monthly.`
      : `Dry run complete. ${candidates.length} rate item(s) would be converted. Re-run with --execute to apply.`,
  );
}

async function runRevert(): Promise<void> {
  const rows: Array<{ id: number; name: string; original: string }> =
    await dataSource.query(
      `SELECT id, name, attributes->>'cadenceOriginalName' AS original
         FROM "product"
        WHERE jsonb_exists(attributes, 'cadenceOriginalName')
        ORDER BY id ASC`,
    );

  console.log(
    EXECUTE
      ? 'Executing revert: restoring original property-rental rate-item names...'
      : 'Dry run: revert of property-rental rate-item names...',
  );

  if (!rows.length) {
    console.log('No converted rate items found. Nothing to revert.');
    return;
  }

  for (const r of rows) {
    console.log(`- productId=${r.id}\n    "${r.name}"\n    → "${r.original}"`);
    if (EXECUTE) {
      await dataSource.query(
        `UPDATE "product"
            SET name = $1,
                attributes = (attributes - 'cadenceOriginalName') - 'billingCycle'
          WHERE id = $2`,
        [r.original, r.id],
      );
    }
  }

  console.log(
    EXECUTE
      ? `Done. Reverted ${rows.length} rate item(s) to their original names.`
      : `Dry run complete. ${rows.length} rate item(s) would be reverted. Re-run with --revert --execute to apply.`,
  );
}

async function bootstrap(): Promise<void> {
  await dataSource.initialize();
  try {
    if (REVERT) {
      await runRevert();
    } else {
      await runConvert();
    }
  } finally {
    await dataSource.destroy();
  }
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
