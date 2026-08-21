/**
 * Prove `assignPlateNumber` works against a REAL database, through the real
 * service, with the real entities.
 *
 * The unit specs can only show that the method calls the right things on mocks.
 * Whether it completes — whether the allocation statement returns the columns
 * the re-signing reads, whether the transaction commits, whether the permit
 * lands — is a property of the database and the entity metadata, and no amount
 * of mocking will tell you. Every bug in this module that reached production
 * got there by passing a mocked test: `"products"` instead of `product`,
 * `p."salePrice"` instead of `sale_price`. A fixture I write agrees with me by
 * construction.
 *
 * DRY RUN by default — it rolls back. Pass --execute to keep the assignment.
 *
 * Usage:  npx ts-node -r tsconfig-paths/register scripts/verify-assign-plate-number.ts <registrationId> <branchId> [--execute]
 */
import dataSource from '../src/data-source';
import { VehicleRegistryService } from '../src/vehicle-registry/vehicle-registry.service';
import { VehicleClass } from '../src/vehicle-registry/entities/vehicle-class.entity';
import { VehicleOwner } from '../src/vehicle-registry/entities/vehicle-owner.entity';
import { Vehicle } from '../src/vehicle-registry/entities/vehicle.entity';
import { VehiclePlateSeries } from '../src/vehicle-registry/entities/vehicle-plate-series.entity';
import { VehiclePlate } from '../src/vehicle-registry/entities/vehicle-plate.entity';
import { VehicleRegistration } from '../src/vehicle-registry/entities/vehicle-registration.entity';
import { VehicleEvent } from '../src/vehicle-registry/entities/vehicle-event.entity';
import { VehicleFlag } from '../src/vehicle-registry/entities/vehicle-flag.entity';
import { Branch } from '../src/branches/entities/branch.entity';

async function main() {
  const [regArg, branchArg] = process.argv.slice(2);
  const execute = process.argv.includes('--execute');
  const registrationId = Number(regArg);
  const branchId = Number(branchArg);

  if (!registrationId || !branchId) {
    console.error('usage: <registrationId> <branchId> [--execute]');
    process.exit(1);
  }

  await dataSource.initialize();

  const svc = new VehicleRegistryService(
    dataSource.getRepository(VehicleClass),
    dataSource.getRepository(VehicleOwner),
    dataSource.getRepository(Vehicle),
    dataSource.getRepository(VehiclePlateSeries),
    dataSource.getRepository(VehiclePlate),
    dataSource.getRepository(VehicleRegistration),
    dataSource.getRepository(VehicleEvent),
    dataSource.getRepository(VehicleFlag),
    dataSource.getRepository(Branch),
    dataSource,
  );

  const before = await dataSource.query(
    `SELECT r."plateId", r."interimPermitNumber", r."interimPermitExpiresAt",
            left(coalesce(r."offlineSignature",''), 24) AS "sigHead"
       FROM "pos_vehicle_registrations" r WHERE r."id" = $1`,
    [registrationId],
  );
  console.log('BEFORE:', before[0]);

  const stock = await dataSource.query(
    `SELECT count(*)::int AS n FROM "pos_vehicle_plates"
      WHERE "branchId" = $1 AND "status" = 'IN_STOCK'`,
    [branchId],
  );
  console.log('blanks in stock:', stock[0]?.n);

  const result = await svc.assignPlateNumber(
    registrationId,
    branchId,
    null,
    1863,
  );

  const after = await dataSource.query(
    `SELECT r."plateId", pl."plateNumber", r."interimPermitNumber",
            r."interimPermitExpiresAt", pl."status" AS "plateStatus",
            left(coalesce(r."offlineSignature",''), 24) AS "sigHead"
       FROM "pos_vehicle_registrations" r
       LEFT JOIN "pos_vehicle_plates" pl ON pl."id" = r."plateId"
      WHERE r."id" = $1`,
    [registrationId],
  );
  console.log('AFTER: ', after[0]);

  const events = await dataSource.query(
    `SELECT "type", "meta" FROM "pos_vehicle_events"
      WHERE "registrationId" = $1 ORDER BY "id" DESC LIMIT 3`,
    [registrationId],
  );
  console.log('events:', JSON.stringify(events));

  console.log('signature changed:', before[0]?.sigHead !== after[0]?.sigHead);

  if (!execute) {
    // Put it back. A verification run must not leave the register different
    // from how it found it unless it was asked to.
    await dataSource.query(
      `UPDATE "pos_vehicle_plates" SET "status" = 'IN_STOCK', "registrationId" = NULL
        WHERE "id" = $1`,
      [result.plateId],
    );
    await dataSource.query(
      `UPDATE "pos_vehicle_registrations"
          SET "plateId" = NULL,
              "interimPermitNumber" = $2,
              "interimPermitExpiresAt" = $3,
              "offlineSignature" = $4
        WHERE "id" = $1`,
      [
        registrationId,
        before[0]?.interimPermitNumber ?? null,
        before[0]?.interimPermitExpiresAt ?? null,
        null,
      ],
    );
    await dataSource.query(
      `DELETE FROM "pos_vehicle_events"
        WHERE "registrationId" = $1 AND "type" IN ('PLATE_ISSUED','INTERIM_PERMIT_ISSUED')
          AND "occurredAt" > now() - interval '5 minutes'`,
      [registrationId],
    );
    console.log('ROLLED BACK (dry run). Pass --execute to keep it.');
  } else {
    console.log('KEPT.');
  }

  await dataSource.destroy();
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  // The query and its parameters are the whole diagnostic — "NaN" tells you a
  // number arrived undefined, not WHICH one.
  console.error('QUERY:', (e as any)?.query);
  console.error('PARAMS:', JSON.stringify((e as any)?.parameters));
  process.exit(1);
});
