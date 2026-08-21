/**
 * Stand up a vehicle-registry office so Phase 1 can actually be exercised.
 *
 * The registry ships with no data of its own: classes are the bureau's policy,
 * fee prices are gazetted, and plate series are physically allotted. Nothing
 * can be registered until somebody puts those three in. This script does that
 * for ONE branch, repeatably.
 *
 * WHAT IT CREATES
 *   1. Six vehicle classes on the branch's TENANT (tenant-scoped: a minibus is
 *      a minibus in every zone).
 *   2. A fee product per class per fee kind, in the BRANCH's catalogue, with a
 *      `branch_inventory` row so the SKU actually resolves. Products are
 *      branch-scoped, which is why classes name SKUs rather than product ids.
 *   3. One plate series PER CLASS CODE, materialised as one row per blank.
 *
 * WHY branch_inventory MATTERS: a product with no link row is invisible to the
 * branch — that is the orphaning that left Burji #106 with an empty board — and
 * an unlinked fee product means the registration desk finds no fee and collects
 * nothing.
 *
 * SCOPE / SAFETY
 *   - Refuses a branch whose serviceFormat is not VEHICLE_REGISTRY, and a
 *     branch with no retailTenantId (without a tenant, region-wide chassis
 *     uniqueness silently degrades to per-office).
 *   - Idempotent: classes match on (tenantId, LOWER(code)), products on SKU,
 *     plates are skipped entirely if the series already exists. Re-running
 *     changes nothing.
 *   - DRY RUN by default; pass --execute to write.
 *   - Reversible: every row it creates is tagged. See the DELETEs at the foot
 *     of this comment.
 *
 * USAGE
 *   Dry run:
 *     node --env-file=.env -r ts-node/register -r tsconfig-paths/register \
 *       scripts/seed-vehicle-registry.ts --branch=<id>
 *   Apply:
 *     ... scripts/seed-vehicle-registry.ts --branch=<id> --execute
 *   Custom plate block:
 *     ... --branch=<id> --region=SM --from=1 --per-code=100 --execute
 *
 * PLATE CODES follow the Ethiopian system: the CLASS code (1 taxi, 2 private,
 * 3 commercial, 4 government, 5 religious & civic) and the REGION code (SM /
 * ሶማ for the Somali Region) are two independent identifiers. One block of
 * blanks is allotted per class code, because a red taxi plate and a white
 * private plate are different physical stock.
 *
 * ROLLBACK (psql, in this order)
 *   DELETE FROM pos_vehicle_plates       WHERE "branchId" = <id>;
 *   DELETE FROM pos_vehicle_plate_series WHERE "branchId" = <id>;
 *   DELETE FROM branch_inventory bi USING product p
 *     WHERE bi."productId" = p.id AND bi."branchId" = <id> AND p.sku LIKE 'VR-%';
 *   DELETE FROM product WHERE sku LIKE 'VR-%';
 *   DELETE FROM pos_vehicle_classes WHERE "tenantId" = <tenant>;
 *   -- classes last: vehicles reference them, so a tenant with live vehicles
 *   -- will refuse this and should.
 */
import dataSource from '../src/data-source';
import {
  formatPlateNumber,
  plateColoursFor,
  SOMALI_REGION_CODE,
} from '../src/vehicle-registry/ethiopian-plates';

const EXECUTE = process.argv.includes('--execute');
const arg = (name: string) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : null;
};

const BRANCH_ID = Number(arg('branch') || 0);
const REGION = (arg('region') || SOMALI_REGION_CODE).toUpperCase();
const FROM = Number(arg('from') || 1);
/** Blanks allotted per class code. Each code is its own physical stock. */
const PER_CODE = Number(arg('per-code') || arg('to') || 100);

/**
 * The classes a regional bureau licenses, with the fee schedule the plan's
 * import examples use. Prices are PLACEHOLDERS — the real figures are gazetted
 * and must come from the Bureau. They are here so the desk has something to
 * charge in a test, not because they are right.
 */
const CLASSES = [
  // plateCode is the ETHIOPIAN CLASS CODE, which is about USE and ownership,
  // not body shape: a minibus driven as a taxi is code 1, the same minibus
  // owned privately is code 2, and a truck on hire is code 3. The body-type
  // split is kept because a bureau's FEES vary by it — a truck pays more than a
  // car — but the plate it gets is decided by the code.
  { code: 'PRIVATE_CAR', plateCode: '2', en: 'Private car', so: 'Gaari gaar loo leeyahay', am: 'የግል መኪና', reg: 1500, renew: 800, plate: 700, inspect: 400 },
  { code: 'PRIVATE_MOTORCYCLE', plateCode: '2', en: 'Private motorcycle', so: 'Mooto gaar ah', am: 'የግል ሞተር ሳይክል', reg: 600, renew: 350, plate: 300, inspect: 200 },
  { code: 'TAXI_MINIBUS', plateCode: '1', en: 'Minibus taxi', so: 'Bas yar oo tagsi ah', am: 'ሚኒባስ ታክሲ', reg: 3000, renew: 1600, plate: 700, inspect: 600 },
  { code: 'TAXI_BAJAJ', plateCode: '1', en: 'Bajaj taxi', so: 'Bajaaj tagsi', am: 'ባጃጅ ታክሲ', reg: 800, renew: 450, plate: 300, inspect: 250 },
  { code: 'COMMERCIAL_TRUCK', plateCode: '3', en: 'Goods truck', so: 'Gaadhi xamuul', am: 'የጭነት መኪና', reg: 4000, renew: 2200, plate: 900, inspect: 800 },
  { code: 'COMMERCIAL_BUS', plateCode: '3', en: 'Bus', so: 'Bas', am: 'አውቶቡስ', reg: 4500, renew: 2400, plate: 900, inspect: 800 },
  { code: 'COMMERCIAL_TRAILER', plateCode: '3', en: 'Trailer', so: 'Taraayle', am: 'ተጎታች', reg: 1200, renew: 700, plate: 700, inspect: 300, noInspection: true },
  { code: 'GOVERNMENT', plateCode: '4', en: 'Government vehicle', so: 'Gaadiidka dowladda', am: 'የመንግስት ተሽከርካሪ', reg: 0, renew: 0, plate: 700, inspect: 400 },
  { code: 'CIVIC_NGO', plateCode: '5', en: 'Religious or civic body', so: 'Hay\u2019ad diini ama bulsho', am: 'ሃይማኖታዊ ወይም ማህበራዊ', reg: 900, renew: 500, plate: 700, inspect: 400 },
];

/** Fees every class shares, priced once rather than per class. */
const SHARED_FEES = [
  { kind: 'TRANSFER', sku: 'VR-TRANSFER', name: 'Ownership transfer', price: 900, category: 'TRANSFER_FEES' },
  { kind: 'PENALTY', sku: 'VR-PENALTY-LATE', name: 'Late renewal penalty', price: 300, category: 'PENALTIES' },
];

type Ctx = { tenantId: number; branchName: string; currency: string; vendorId: number };

async function resolveBranch(branchId: number): Promise<Ctx> {
  const rows = await dataSource.query(
    `SELECT id, name, "serviceFormat", "retailTenantId", "ownerId" FROM branches WHERE id = $1`,
    [branchId],
  );
  const branch = rows?.[0];
  if (!branch) throw new Error(`Branch ${branchId} does not exist.`);
  if (String(branch.serviceFormat).toUpperCase() !== 'VEHICLE_REGISTRY') {
    throw new Error(
      `Branch ${branchId} is ${branch.serviceFormat ?? 'unset'}, not VEHICLE_REGISTRY. ` +
        `Set its service format first — seeding a registry into a shop's catalogue is not recoverable by re-running this.`,
    );
  }
  if (!branch.retailTenantId) {
    throw new Error(
      `Branch ${branchId} has no retailTenantId. Without a tenant the registry cannot enforce region-wide chassis uniqueness, which is the whole point of it.`,
    );
  }
  // A product must name a vendor — it is NOT NULL on the table and has no
  // default. The office's own owner is the only defensible answer: a fee
  // product vended by somebody else would show up in their catalogue.
  if (!branch.ownerId) {
    throw new Error(
      `Branch ${branchId} has no ownerId, and a product cannot be created without a vendor. Give the office an owner first.`,
    );
  }
  return {
    tenantId: branch.retailTenantId,
    branchName: branch.name,
    currency: 'ETB',
    vendorId: branch.ownerId,
  };
}

async function upsertProduct(
  ctx: Ctx,
  branchId: number,
  sku: string,
  name: string,
  price: number,
  category: string,
): Promise<{ id: number; created: boolean }> {
  const existing = await dataSource.query(
    `SELECT id FROM product WHERE UPPER(sku) = UPPER($1) LIMIT 1`,
    [sku],
  );
  if (existing?.[0]) {
    await linkToBranch(branchId, existing[0].id);
    return { id: existing[0].id, created: false };
  }

  // Columns read off the live schema rather than assumed: there is no
  // productType and no updatedAt on this table, description and vendorId are
  // NOT NULL with no default, and manage_stock must be false — a statutory fee
  // is not stock, and the only thing a registry office counts is blank plates.
  const inserted = await dataSource.query(
    `INSERT INTO product (name, sku, price, currency, description, "vendorId",
                          attributes, manage_stock, "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, false, now())
     RETURNING id`,
    [
      name,
      sku,
      price,
      ctx.currency,
      `${name} — statutory fee collected at the registry counter.`,
      ctx.vendorId,
      JSON.stringify({ browseCategory: category }),
    ],
  );
  const id = inserted[0].id;
  await linkToBranch(branchId, id);
  return { id, created: true };
}

/** Without this row the branch cannot see the product, so the fee resolves to nothing. */
async function linkToBranch(branchId: number, productId: number) {
  await dataSource.query(
    `INSERT INTO branch_inventory ("branchId", "productId", "quantityOnHand", "reservedQuantity")
     VALUES ($1, $2, 0, 0)
     ON CONFLICT ("branchId", "productId") DO NOTHING`,
    [branchId, productId],
  );
}

async function main() {
  if (!BRANCH_ID) {
    throw new Error('Pass --branch=<id>.');
  }

  await dataSource.initialize();
  const ctx = await resolveBranch(BRANCH_ID);

  console.log(
    `\n[seed] ${ctx.branchName} (branch ${BRANCH_ID}, tenant ${ctx.tenantId})`,
  );
  console.log(`[seed] ${EXECUTE ? 'EXECUTING' : 'DRY RUN — pass --execute to write'}\n`);

  // ── 1 + 2. Classes and their fee products ───────────────────────────────
  for (const c of CLASSES) {
    const existing = await dataSource.query(
      `SELECT id FROM pos_vehicle_classes WHERE "tenantId" = $1 AND LOWER(code) = LOWER($2)`,
      [ctx.tenantId, c.code],
    );

    const fees = [
      { sku: `VR-${c.code}-REG`, name: `${c.en} — Registration`, price: c.reg, category: 'REGISTRATION_FEES', col: 'registrationFeeSku' },
      { sku: `VR-${c.code}-RENEW`, name: `${c.en} — Renewal`, price: c.renew, category: 'RENEWAL_FEES', col: 'renewalFeeSku' },
      { sku: `VR-${c.code}-PLATE`, name: `${c.en} — Number plate`, price: c.plate, category: 'PLATE_FEES', col: 'plateFeeSku' },
      { sku: `VR-${c.code}-INSPECT`, name: `${c.en} — Inspection`, price: c.inspect, category: 'INSPECTION_FEES', col: 'inspectionFeeSku' },
    ];

    console.log(`  ${c.code.padEnd(12)} ${existing?.[0] ? '(class exists)' : '(new class)'}`);
    for (const f of fees) {
      console.log(`      ${f.sku.padEnd(26)} ${ctx.currency} ${String(f.price).padStart(6)}`);
      if (EXECUTE) await upsertProduct(ctx, BRANCH_ID, f.sku, f.name, f.price, f.category);
    }

    if (EXECUTE && !existing?.[0]) {
      await dataSource.query(
        `INSERT INTO pos_vehicle_classes
           ("tenantId", code, "nameEn", "nameSo", "nameAm", "renewalMonths",
            "inspectionRequired", "plateFollowsVehicle",
            "registrationFeeSku", "renewalFeeSku", "plateFeeSku", "inspectionFeeSku",
            "transferFeeSku", "penaltyFeeSku", "sortOrder", status,
            "plateCode", "plateBackgroundColour", "plateTextColour")
         VALUES ($1,$2,$3,$4,$5,12,$6,true,$7,$8,$9,$10,'VR-TRANSFER','VR-PENALTY-LATE',$11,'ACTIVE',
                 $12,$13,$14)`,
        [
          ctx.tenantId, c.code, c.en, c.so, c.am,
          c.noInspection ? false : true,
          `VR-${c.code}-REG`, `VR-${c.code}-RENEW`, `VR-${c.code}-PLATE`, `VR-${c.code}-INSPECT`,
          CLASSES.indexOf(c) * 10,
          c.plateCode,
          plateColoursFor(c.plateCode).background,
          plateColoursFor(c.plateCode).text,
        ],
      );
    }
  }

  console.log('\n  shared fees');
  for (const f of SHARED_FEES) {
    console.log(`      ${f.sku.padEnd(26)} ${ctx.currency} ${String(f.price).padStart(6)}`);
    if (EXECUTE) await upsertProduct(ctx, BRANCH_ID, f.sku, f.name, f.price, f.category);
  }

  // ── 3. Plate series, one block per class code ───────────────────────────
  //
  // A bureau is allotted separate blocks per CLASS code, not one shared block:
  // taxi plates and private plates are physically different stock, and code 1
  // is a red plate while code 2 is white with blue lettering. Seeding one
  // series per distinct code is what the office actually holds in its drawer.
  const plateCodes = [...new Set(CLASSES.map((c) => c.plateCode))].sort();

  console.log(`\n  plate series — region ${REGION}, ${PER_CODE} blanks per class code`);

  for (const plateCode of plateCodes) {
    const existing = await dataSource.query(
      `SELECT id FROM pos_vehicle_plate_series
        WHERE "branchId" = $1 AND "plateCode" = $2 AND "regionCode" = $3`,
      [BRANCH_ID, plateCode, REGION],
    );

    const first = formatPlateNumber(plateCode, REGION, FROM);
    const last = formatPlateNumber(plateCode, REGION, FROM + PER_CODE - 1);
    console.log(
      `      ${String(plateCode).padEnd(3)} ${first} … ${last}` +
        (existing?.[0] ? '  — already allotted' : ''),
    );

    if (!EXECUTE || existing?.[0]) continue;

    const numbers = Array.from({ length: PER_CODE }, (_, i) => FROM + i);
    const wanted = numbers.map((n) => formatPlateNumber(plateCode, REGION, n));

    // Refuse the WHOLE block if any number is already in the region. A partial
    // allotment leaves an office holding blanks the system believes belong to
    // another woreda.
    const clash = await dataSource.query(
      `SELECT "plateNumber" FROM pos_vehicle_plates
        WHERE "tenantId" = $1 AND "plateNumber" = ANY($2::text[]) LIMIT 5`,
      [ctx.tenantId, wanted],
    );
    if (clash.length) {
      throw new Error(
        `These plate numbers already exist in the region: ${clash
          .map((c: any) => c.plateNumber)
          .join(', ')}. Refusing the whole series.`,
      );
    }

    const series = await dataSource.query(
      `INSERT INTO pos_vehicle_plate_series
         ("tenantId","branchId","plateCode","regionCode",prefix,"rangeStart","rangeEnd","numberWidth",status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,5,'ACTIVE') RETURNING id`,
      [ctx.tenantId, BRANCH_ID, plateCode, REGION, plateCode, FROM, FROM + PER_CODE - 1],
    );

    await dataSource.query(
      `INSERT INTO pos_vehicle_plates
         ("tenantId","branchId","seriesId","plateNumber","plateCode","regionCode","serial","sortKey",status)
       SELECT $1, $2, $3, unnest($4::text[]), $5, $6, unnest($7::int[]), unnest($7::int[]), 'IN_STOCK'`,
      [ctx.tenantId, BRANCH_ID, series[0].id, wanted, plateCode, REGION, numbers],
    );
  }

  if (EXECUTE) {
    const [{ count: classCount }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM pos_vehicle_classes WHERE "tenantId" = $1`,
      [ctx.tenantId],
    );
    const [{ count: plateCount }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM pos_vehicle_plates WHERE "branchId" = $1 AND status = 'IN_STOCK'`,
      [BRANCH_ID],
    );
    console.log(
      `\n[seed] done — ${classCount} classes for the bureau, ${plateCount} blanks in this office's drawer.\n`,
    );
  } else {
    console.log('\n[seed] nothing written. Re-run with --execute.\n');
  }

  await dataSource.destroy();
}

main().catch(async (err) => {
  console.error(`\n[seed] FAILED: ${err.message}\n`);
  try {
    await dataSource.destroy();
  } catch {
    /* already closed */
  }
  process.exit(1);
});
