import { randomInt } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  PosCheckout,
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from '../pos-sync/entities/pos-checkout.entity';
import { RECEIPT_VERIFICATION_CODE_ALPHABET } from '../pos-sync/receipt-verification-code';
import {
  VehicleClass,
  VehicleClassStatus,
} from './entities/vehicle-class.entity';
import {
  VehicleOwner,
  VehicleOwnerKind,
} from './entities/vehicle-owner.entity';
import { Vehicle } from './entities/vehicle.entity';
import {
  VehiclePlateSeries,
  VehiclePlateSeriesStatus,
} from './entities/vehicle-plate-series.entity';
import {
  VehiclePlate,
  VehiclePlateStatus,
} from './entities/vehicle-plate.entity';
import {
  VehicleRegistration,
  VehicleRegistrationStatus,
} from './entities/vehicle-registration.entity';
import {
  VehicleEvent,
  VehicleEventType,
} from './entities/vehicle-event.entity';
import { VehicleFlag, VehicleFlagType } from './entities/vehicle-flag.entity';
import {
  DEFAULT_PLATE_SERIAL_WIDTH,
  formatPlateNumber,
  SOMALI_REGION_CODE,
} from './ethiopian-plates';
import { signCertificate } from './certificate-signing';
import {
  CreatePlateSeriesDto,
  CreateVehicleClassDto,
  DraftRegistrationDto,
  IssueRegistrationDto,
  ListPlateStockDto,
  ListVehicleClassesDto,
  SearchVehiclesDto,
  UpdateVehicleClassDto,
} from './dto/vehicle-registry.dto';

/** Codes are 14 chars of Crockford base32 — 70 bits, minted server-side here. */
const VERIFICATION_CODE_LENGTH = 14;

/** How many distinct codes to try before giving up. Collisions are ~never. */
const VERIFICATION_CODE_ATTEMPTS = 5;

/**
 * Materialising a plate series is the one bulk insert in the registry. A Bureau
 * hands an office a few thousand blanks at a time, and one statement per plate
 * would be a few thousand round-trips.
 */
const PLATE_INSERT_CHUNK = 500;

/**
 * A series is capped at 100k plates. Not a technical limit — a guard against a
 * typo'd range (5-1 to 5-99999999) locking the table while it writes a hundred
 * million rows nobody asked for.
 */
const MAX_PLATES_PER_SERIES = 100_000;

export type VehicleFeeKind =
  | 'REGISTRATION'
  | 'RENEWAL'
  | 'TRANSFER'
  | 'PLATE'
  | 'INSPECTION'
  | 'PENALTY';

export interface ResolvedFeeLine {
  kind: VehicleFeeKind;
  sku: string;
  productId: number;
  title: string;
  unitPrice: number;
}

@Injectable()
export class VehicleRegistryService {
  constructor(
    @InjectRepository(VehicleClass)
    private readonly classesRepository: Repository<VehicleClass>,
    @InjectRepository(VehicleOwner)
    private readonly ownersRepository: Repository<VehicleOwner>,
    @InjectRepository(Vehicle)
    private readonly vehiclesRepository: Repository<Vehicle>,
    @InjectRepository(VehiclePlateSeries)
    private readonly seriesRepository: Repository<VehiclePlateSeries>,
    @InjectRepository(VehiclePlate)
    private readonly platesRepository: Repository<VehiclePlate>,
    @InjectRepository(VehicleRegistration)
    private readonly registrationsRepository: Repository<VehicleRegistration>,
    @InjectRepository(VehicleEvent)
    private readonly eventsRepository: Repository<VehicleEvent>,
    @InjectRepository(VehicleFlag)
    private readonly flagsRepository: Repository<VehicleFlag>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Scope ────────────────────────────────────────────────────────────────

  /**
   * The Bureau behind an office.
   *
   * Every registry query is tenant-scoped, so this is the hinge the whole
   * module turns on: `PosBranchAccessGuard` has already proved the caller may
   * act on `branchId`, and this widens that to the region for the queries that
   * must span it — chassis uniqueness above all.
   *
   * A registry branch with no tenant is a misconfiguration, not a default. If
   * it were allowed to fall through to "just this branch", the region-wide
   * uniqueness that justifies the whole system would silently become per-office
   * uniqueness, and nobody would find out until two woredas had issued the same
   * plate.
   */
  private async resolveTenantId(branchId: number): Promise<number> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId },
      select: { id: true, retailTenantId: true, serviceFormat: true },
    });

    if (!branch) {
      throw new NotFoundException(`Branch ${branchId} not found`);
    }

    if (!branch.retailTenantId) {
      throw new BadRequestException(
        `Branch ${branchId} is not attached to a tenant, so region-wide vehicle uniqueness cannot be enforced. A registry office must belong to the bureau's tenant.`,
      );
    }

    return branch.retailTenantId;
  }

  // ── Classes ──────────────────────────────────────────────────────────────

  async listClasses(dto: ListVehicleClassesDto): Promise<VehicleClass[]> {
    const tenantId = await this.resolveTenantId(dto.branchId);
    return this.classesRepository.find({
      where: dto.status ? { tenantId, status: dto.status } : { tenantId },
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
  }

  async createClass(dto: CreateVehicleClassDto): Promise<VehicleClass> {
    const tenantId = await this.resolveTenantId(dto.branchId);
    await this.assertClassCodeFree(tenantId, dto.code);

    const row = this.classesRepository.create({
      tenantId,
      code: dto.code,
      nameEn: dto.nameEn,
      nameSo: dto.nameSo ?? null,
      nameAm: dto.nameAm ?? null,
      plateSeriesPrefix: dto.plateSeriesPrefix ?? null,
      renewalMonths: dto.renewalMonths ?? 12,
      inspectionRequired: dto.inspectionRequired ?? true,
      plateFollowsVehicle: dto.plateFollowsVehicle ?? true,
      registrationFeeSku: dto.registrationFeeSku ?? null,
      renewalFeeSku: dto.renewalFeeSku ?? null,
      transferFeeSku: dto.transferFeeSku ?? null,
      plateFeeSku: dto.plateFeeSku ?? null,
      inspectionFeeSku: dto.inspectionFeeSku ?? null,
      penaltyFeeSku: dto.penaltyFeeSku ?? null,
      sortOrder: dto.sortOrder ?? 0,
      status: VehicleClassStatus.ACTIVE,
    });

    return this.classesRepository.save(row);
  }

  async updateClass(
    id: number,
    dto: UpdateVehicleClassDto,
  ): Promise<VehicleClass> {
    const tenantId = await this.resolveTenantId(dto.branchId);
    const row = await this.classesRepository.findOne({
      where: { id, tenantId },
    });
    if (!row) {
      throw new NotFoundException(`Vehicle class ${id} not found`);
    }

    if (dto.code && dto.code.toUpperCase() !== row.code.toUpperCase()) {
      await this.assertClassCodeFree(tenantId, dto.code);
      row.code = dto.code;
    }

    row.nameEn = dto.nameEn ?? row.nameEn;
    row.nameSo = dto.nameSo ?? row.nameSo;
    row.nameAm = dto.nameAm ?? row.nameAm;
    row.plateSeriesPrefix = dto.plateSeriesPrefix ?? row.plateSeriesPrefix;
    row.renewalMonths = dto.renewalMonths ?? row.renewalMonths;
    row.inspectionRequired = dto.inspectionRequired ?? row.inspectionRequired;
    row.plateFollowsVehicle =
      dto.plateFollowsVehicle ?? row.plateFollowsVehicle;
    row.registrationFeeSku = dto.registrationFeeSku ?? row.registrationFeeSku;
    row.renewalFeeSku = dto.renewalFeeSku ?? row.renewalFeeSku;
    row.transferFeeSku = dto.transferFeeSku ?? row.transferFeeSku;
    row.plateFeeSku = dto.plateFeeSku ?? row.plateFeeSku;
    row.inspectionFeeSku = dto.inspectionFeeSku ?? row.inspectionFeeSku;
    row.penaltyFeeSku = dto.penaltyFeeSku ?? row.penaltyFeeSku;
    row.sortOrder = dto.sortOrder ?? row.sortOrder;
    row.status = dto.status ?? row.status;

    return this.classesRepository.save(row);
  }

  private async assertClassCodeFree(tenantId: number, code: string) {
    const clash = await this.classesRepository
      .createQueryBuilder('c')
      .where('c."tenantId" = :tenantId', { tenantId })
      .andWhere('LOWER(c."code") = LOWER(:code)', { code })
      .getCount();

    if (clash > 0) {
      throw new ConflictException(
        `A vehicle class with code "${code}" already exists for this bureau.`,
      );
    }
  }

  // ── Plate stock ──────────────────────────────────────────────────────────

  /**
   * Allot a block of plate numbers to an office, materialising every one.
   *
   * The whole range becomes rows up front. That is what makes allocation a
   * single atomic statement later, makes remaining stock a COUNT, and gives a
   * spoiled or lost blank somewhere to be recorded. A `nextNumber` counter
   * would be smaller and would fail in both the ways a registry cannot afford:
   * two clerks reading it in the same second, and no home for a plate that went
   * missing between the drawer and the car.
   */
  async createPlateSeries(dto: CreatePlateSeriesDto): Promise<{
    series: VehiclePlateSeries;
    platesCreated: number;
  }> {
    const tenantId = await this.resolveTenantId(dto.branchId);

    if (dto.rangeEnd < dto.rangeStart) {
      throw new BadRequestException(
        'The end of a plate series cannot be below its start.',
      );
    }

    const count = dto.rangeEnd - dto.rangeStart + 1;
    if (count > MAX_PLATES_PER_SERIES) {
      throw new BadRequestException(
        `A series of ${count.toLocaleString()} plates is almost certainly a typo. The limit is ${MAX_PLATES_PER_SERIES.toLocaleString()}; issue several series if the bureau really has that many blanks.`,
      );
    }

    const width = dto.numberWidth ?? DEFAULT_PLATE_SERIAL_WIDTH;

    // An Ethiopian plate carries a CLASS code and a REGION code, two
    // independent identifiers. The original single `prefix` conflated them and
    // seeded the Somali Region with '5' — which is the class code for religious
    // and civic bodies, not a region at all. The class supplies the code; the
    // region defaults to the bureau's own, since an office issues its own.
    const seriesClass = dto.classId
      ? await this.classesRepository.findOne({
          where: { id: dto.classId, tenantId },
        })
      : null;

    const plateCode = dto.plateCode ?? seriesClass?.plateCode ?? dto.prefix;
    const regionCode = (dto.regionCode ?? SOMALI_REGION_CODE).toUpperCase();

    const numbers = Array.from({ length: count }, (_, i) => dto.rangeStart + i);
    const formatted = numbers.map((n) =>
      formatPlateNumber(plateCode, regionCode, n, width),
    );

    // Refuse the whole series if ANY number in it already exists anywhere in
    // the region. Partial creation would leave an office holding blanks the
    // system believes belong to another woreda — the exact confusion the
    // tenant-wide unique index exists to prevent, discovered one plate at a
    // time instead of all at once.
    const clashes = await this.platesRepository
      .createQueryBuilder('p')
      .select('p."plateNumber"', 'plateNumber')
      .where('p."tenantId" = :tenantId', { tenantId })
      .andWhere('UPPER(p."plateNumber") IN (:...numbers)', {
        numbers: formatted.map((n) => n.toUpperCase()),
      })
      .limit(5)
      .getRawMany<{ plateNumber: string }>();

    if (clashes.length > 0) {
      throw new ConflictException(
        `These plate numbers already exist in the region: ${clashes
          .map((c) => c.plateNumber)
          .join(', ')}${clashes.length === 5 ? ' (and possibly more)' : ''}.`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const series = await manager.save(
        manager.create(VehiclePlateSeries, {
          tenantId,
          branchId: dto.branchId,
          classId: dto.classId ?? null,
          plateCode,
          regionCode,
          prefix: dto.prefix,
          rangeStart: dto.rangeStart,
          rangeEnd: dto.rangeEnd,
          numberWidth: width,
          status: VehiclePlateSeriesStatus.ACTIVE,
        }),
      );

      for (let i = 0; i < formatted.length; i += PLATE_INSERT_CHUNK) {
        const chunk = formatted.slice(i, i + PLATE_INSERT_CHUNK);
        await manager
          .createQueryBuilder()
          .insert()
          .into(VehiclePlate)
          .values(
            chunk.map((plateNumber, offset) => ({
              tenantId,
              branchId: dto.branchId,
              seriesId: series.id,
              plateNumber,
              // Stored apart as well as composed, so the printed arrangement
              // can be corrected without anything having to parse it back.
              plateCode,
              regionCode,
              serial: numbers[i + offset],
              // The numeric part, so plates go out in the order the office has
              // them stacked. Sorting on the printed string would put 5-01000
              // before 5-0999 and hand out the drawer backwards.
              sortKey: numbers[i + offset],
              status: VehiclePlateStatus.IN_STOCK,
            })),
          )
          .execute();
      }

      return { series, platesCreated: formatted.length };
    });
  }

  /** What the office actually has left, by series and status. */
  async listPlateStock(dto: ListPlateStockDto) {
    const tenantId = await this.resolveTenantId(dto.branchId);

    const series = await this.seriesRepository.find({
      where: dto.seriesId
        ? { tenantId, branchId: dto.branchId, id: dto.seriesId }
        : { tenantId, branchId: dto.branchId },
      order: { createdAt: 'ASC' },
    });

    if (series.length === 0) return [];

    const counts = await this.platesRepository
      .createQueryBuilder('p')
      .select('p."seriesId"', 'seriesId')
      .addSelect('p."status"', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('p."seriesId" IN (:...ids)', { ids: series.map((s) => s.id) })
      .groupBy('p."seriesId"')
      .addGroupBy('p."status"')
      .getRawMany<{ seriesId: string; status: string; count: string }>();

    return series.map((s) => {
      const mine = counts.filter((c) => String(c.seriesId) === String(s.id));
      const byStatus: Record<string, number> = {};
      for (const row of mine) byStatus[row.status] = Number(row.count);
      return {
        series: s,
        byStatus,
        remaining: byStatus[VehiclePlateStatus.IN_STOCK] ?? 0,
      };
    });
  }

  /**
   * Take the next plate off the shelf, atomically.
   *
   * `FOR UPDATE SKIP LOCKED` is the entire safety argument: two clerks pressing
   * Issue in the same second get different plates, because the second skips the
   * row the first has locked rather than blocking on it or reading it as free.
   * A SELECT-then-UPDATE would hand both the same number.
   */
  private async allocatePlate(
    manager: EntityManager,
    params: {
      tenantId: number;
      branchId: number;
      classId: number;
      registrationId: number;
      seriesId?: number | null;
    },
  ): Promise<VehiclePlate | null> {
    const rows = await manager.query(
      `
      UPDATE "pos_vehicle_plates" p
         SET "status" = $1,
             "registrationId" = $2,
             "updatedAt" = now()
       WHERE p."id" = (
         SELECT pick."id"
           FROM "pos_vehicle_plates" pick
           JOIN "pos_vehicle_plate_series" s ON s."id" = pick."seriesId"
          WHERE pick."tenantId" = $3
            AND pick."branchId" = $4
            AND pick."status" = $5
            AND s."status" = $6
            AND ($7::bigint IS NULL OR pick."seriesId" = $7::bigint)
            AND (s."classId" IS NULL OR s."classId" = $8::bigint)
          ORDER BY s."createdAt" ASC, pick."sortKey" ASC
          LIMIT 1
          FOR UPDATE OF pick SKIP LOCKED
       )
      RETURNING p.*
      `,
      [
        VehiclePlateStatus.ALLOCATED,
        params.registrationId,
        params.tenantId,
        params.branchId,
        VehiclePlateStatus.IN_STOCK,
        VehiclePlateSeriesStatus.ACTIVE,
        params.seriesId ?? null,
        params.classId,
      ],
    );

    // A data-modifying statement does NOT return rows the way a SELECT does.
    //
    // TypeORM's Postgres driver answers an `UPDATE ... RETURNING` with
    // `[rows, affectedCount]` — a two-element array whose FIRST element is the
    // array of returned rows. Reading `rows[0]` therefore yields an array of
    // plates, not a plate, and `Number(thatArray.id)` is NaN. Worse, an empty
    // result is `[[], 0]`, and `[]` is truthy, so the "no stock" branch below
    // never fired either: an office with an empty drawer got a NaN plate id
    // rather than the null this method promises.
    //
    // Both halves of that were invisible to the unit specs, because the mocked
    // `manager.query` returned a bare row array — the shape a SELECT gives. A
    // fixture I write agrees with me by construction; only running the real
    // statement against a real Postgres showed the difference. The mocks now
    // return the driver's actual shape.
    const returned =
      Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
    const plate = Array.isArray(returned) ? returned[0] : null;

    // Null is an answer, not a failure. A real plate number is requested through
    // the Bureau rather than taken off a shelf, so an office with no stock is
    // the ordinary case — and refusing to register a vehicle because of it
    // would block the entire drive over a number the Bureau was never going to
    // issue at the counter.
    return (plate as VehiclePlate) ?? null;
  }

  // ── Fees ─────────────────────────────────────────────────────────────────

  /**
   * What this class of vehicle is charged, resolved against THIS office's
   * catalogue.
   *
   * Classes are tenant-scoped and products are branch-scoped, so the class
   * names a SKU and each office holds its own product row for it. The returned
   * `unitPrice` is what the desk shows; it is not what is charged. The charge
   * comes from `PosCheckoutService`, which re-prices every line from the
   * product record — so a clerk who edits the basket still pays the gazetted
   * fee, and this figure is a preview, not an authority.
   *
   * Deliberately resolves through `branch_inventory` and
   * `branch_catalog_product_links` ONLY, not `branch_catalog_vendor_links`. A
   * vendor link matches by store rather than by product, so for a multi-branch
   * owner it would let one office's fee product resolve at another's counter —
   * and a statutory fee resolving to the wrong office's price is exactly the
   * failure this must not have.
   */
  async resolveFeeLines(
    branchId: number,
    klass: VehicleClass,
    kinds: VehicleFeeKind[],
  ): Promise<{ lines: ResolvedFeeLine[]; missing: VehicleFeeKind[] }> {
    const skuByKind: Record<VehicleFeeKind, string | null> = {
      REGISTRATION: klass.registrationFeeSku,
      RENEWAL: klass.renewalFeeSku,
      TRANSFER: klass.transferFeeSku,
      PLATE: klass.plateFeeSku,
      INSPECTION: klass.inspectionFeeSku,
      PENALTY: klass.penaltyFeeSku,
    };

    const wanted = kinds
      .map((kind) => ({ kind, sku: skuByKind[kind] }))
      .filter((entry): entry is { kind: VehicleFeeKind; sku: string } =>
        Boolean(entry.sku),
      );

    const missing = kinds.filter((kind) => !skuByKind[kind]);
    if (wanted.length === 0) return { lines: [], missing };

    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT ON (UPPER(p."sku"))
             p."id"        AS "productId",
             p."sku"       AS "sku",
             p."name"      AS "title",
             -- sale_price, NOT "salePrice": the entity property is camelCase but
             -- the column is snake, and raw SQL does not get the mapping.
             COALESCE(p."sale_price", p."price", 0) AS "unitPrice"
        -- "product", singular. The entity is @Entity() with no argument, so
        -- TypeORM names the table after the lowercased class — and raw SQL has
        -- to say what the database says, not what the property is called.
        FROM "product" p
       WHERE UPPER(p."sku") IN (${wanted.map((_, i) => `$${i + 2}`).join(', ')})
         AND (
           EXISTS (
             SELECT 1 FROM "branch_inventory" bi
              WHERE bi."branchId" = $1 AND bi."productId" = p."id"
           )
           OR EXISTS (
             SELECT 1 FROM "branch_catalog_product_links" bl
              WHERE bl."branchId" = $1 AND bl."productId" = p."id"
           )
         )
       ORDER BY UPPER(p."sku"), p."id" ASC
      `,
      [branchId, ...wanted.map((w) => w.sku.toUpperCase())],
    );

    const bySku = new Map<string, any>();
    for (const row of rows as any[]) {
      bySku.set(String(row.sku).toUpperCase(), row);
    }

    const lines: ResolvedFeeLine[] = [];
    for (const entry of wanted) {
      const row = bySku.get(entry.sku.toUpperCase());
      if (!row) {
        missing.push(entry.kind);
        continue;
      }
      lines.push({
        kind: entry.kind,
        sku: String(row.sku),
        productId: Number(row.productId),
        title: String(row.title ?? entry.sku),
        unitPrice: Number(row.unitPrice ?? 0),
      });
    }

    return { lines, missing };
  }

  // ── Search ───────────────────────────────────────────────────────────────

  /**
   * One box, because a counter has one.
   *
   * A clerk is handed a plate, a logbook or a name, and should not have to
   * decide which field they are holding before they can look it up. Plate and
   * chassis match exactly (case-folded); a name matches loosely, because an
   * owner's name is rarely typed the same way twice — 'Cabdi' and 'Abdi' are
   * the same person to everyone except a LIKE query.
   *
   * Tenant-scoped, not branch-scoped: an owner who registered in Jigjiga and
   * renews in Godey must be findable at the counter in front of them.
   */
  async searchVehicles(dto: SearchVehiclesDto) {
    const tenantId = await this.resolveTenantId(dto.branchId);
    const q = (dto.q ?? '').trim();
    const limit = dto.limit ?? 25;

    if (!q) return [];

    const rows = await this.dataSource.query(
      `
      SELECT r."id"                AS "registrationId",
             r."status"            AS "registrationStatus",
             r."expiresAt"         AS "expiresAt",
             r."certificateNumber" AS "certificateNumber",
             v."id"                AS "vehicleId",
             v."vin"               AS "vin",
             v."make"              AS "make",
             v."model"             AS "model",
             v."colour"            AS "colour",
             v."presentedPlateNumber" AS "presentedPlateNumber",
             v."presentedPlateOrigin" AS "presentedPlateOrigin",
             v."chassisCondition"     AS "chassisCondition",
             v."modelYear"         AS "modelYear",
             c."code"              AS "classCode",
             c."nameEn"            AS "className",
             o."id"                AS "ownerId",
             o."fullName"          AS "ownerName",
             o."phone"             AS "ownerPhone",
             pl."plateNumber"      AS "plateNumber"
        FROM "pos_vehicles" v
        JOIN "pos_vehicle_classes" c ON c."id" = v."classId"
        LEFT JOIN "pos_vehicle_registrations" r
               ON r."vehicleId" = v."id"
              AND r."status" IN ('ACTIVE', 'PENDING_ISSUE')
        LEFT JOIN "pos_vehicle_owners" o ON o."id" = r."ownerId"
        LEFT JOIN "pos_vehicle_plates" pl ON pl."id" = r."plateId"
       WHERE v."tenantId" = $1
         AND (
           UPPER(v."vin") = UPPER($2)
           -- The number the vehicle USED to wear. A police file or an
           -- insurance claim from before the drive references that number and
           -- nothing else, so it has to resolve.
           OR UPPER(COALESCE(v."presentedPlateNumber", '')) = UPPER($2)
           OR UPPER(COALESCE(v."engineNumber", '')) = UPPER($2)
           OR UPPER(COALESCE(pl."plateNumber", '')) = UPPER($2)
           OR LOWER(COALESCE(o."fullName", '')) LIKE LOWER($3)
           OR COALESCE(o."phone", '') = $2
         )
       ORDER BY r."issuedAt" DESC NULLS LAST, v."id" DESC
       LIMIT $4
      `,
      [tenantId, q, `%${q}%`, limit],
    );

    return rows as unknown[];
  }

  // ── Registration ─────────────────────────────────────────────────────────

  /**
   * Take the details and reserve a plate, WITHOUT issuing anything.
   *
   * This is the first half of payment-then-issue. It creates the owner, the
   * vehicle and a PENDING_ISSUE registration, and moves a plate from IN_STOCK
   * to ALLOCATED so no second clerk can take it — but nothing is issued, no
   * certificate exists, and the registration is not ACTIVE. The desk then sends
   * the returned fee lines to the till, and {@link issueRegistration} completes
   * it against the settled checkout.
   *
   * Doing it in this order is what keeps a paid citizen whole. If the fee is
   * never paid, an unissued draft and a reserved plate are recoverable; if
   * issuance ran first, a failed payment would leave a live certificate for a
   * vehicle nobody paid to register.
   */
  async draftRegistration(dto: DraftRegistrationDto, actorUserId?: number) {
    const tenantId = await this.resolveTenantId(dto.branchId);

    const klass = await this.classesRepository.findOne({
      where: { id: dto.classId, tenantId },
    });
    if (!klass) {
      throw new NotFoundException(`Vehicle class ${dto.classId} not found`);
    }
    if (klass.status !== VehicleClassStatus.ACTIVE) {
      throw new BadRequestException(
        `"${klass.nameEn}" is retired and no longer registrable.`,
      );
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const owner = await this.resolveOwner(manager, tenantId, dto);
      const vehicle = await this.resolveVehicle(manager, tenantId, dto, klass);

      const registration = await manager.save(
        manager.create(VehicleRegistration, {
          tenantId,
          branchId: dto.branchId,
          vehicleId: vehicle.id,
          ownerId: owner.id,
          plateId: null,
          status: VehicleRegistrationStatus.PENDING_ISSUE,
          issuedByUserId: actorUserId ?? null,
        }),
      );

      // Best-effort. If the office happens to hold stock for this class the
      // vehicle gets a number now; if it does not — the normal case — it is
      // registered anyway and the number is requested separately. Registering
      // the vehicle is the goal; the plate is a later, separate matter.
      const plate = await this.allocatePlate(manager, {
        tenantId,
        branchId: dto.branchId,
        classId: Number(klass.id),
        registrationId: Number(registration.id),
        seriesId: dto.plateSeriesId ?? null,
      });

      if (plate) {
        registration.plateId = Number(plate.id);
        await manager.save(registration);
      }

      return { registration, vehicle, owner, plate };
    });

    // Everything the desk needs to know about the number this vehicle turned up
    // wearing. Computed after the record exists so the vehicle itself is
    // excluded from its own duplicate check.
    const presentedAssessment = await this.assessPresentedPlate(
      tenantId,
      dto.vehicle.presentedPlateNumber,
      Number(result.vehicle.id),
    );

    // If the invented number is a real blank in this office's drawer, take it
    // out of the pool now — before some later registration is handed a number
    // that is already on a car.
    if (
      presentedAssessment.collidesWithOfficialStock &&
      presentedAssessment.officialPlateStatus === VehiclePlateStatus.IN_STOCK &&
      dto.vehicle.presentedPlateNumber
    ) {
      await this.dataSource.transaction((manager) =>
        this.quarantinePlate(
          manager,
          tenantId,
          dto.vehicle.presentedPlateNumber,
          `Already in circulation on chassis ${result.vehicle.vin} at registration`,
        ),
      );
    }

    // A first registration is the registration fee plus the plate itself.
    const { lines, missing } = await this.resolveFeeLines(dto.branchId, klass, [
      'REGISTRATION',
      'PLATE',
    ]);

    return {
      ...result,
      class: klass,
      presentedPlate: presentedAssessment,
      feeLines: lines,
      // Surfaced, never silently dropped: a class whose fee product this office
      // does not carry would otherwise register a vehicle for nothing, and the
      // shortfall would only appear in the month's revenue.
      missingFees: missing,
    };
  }

  private async resolveOwner(
    manager: EntityManager,
    tenantId: number,
    dto: DraftRegistrationDto,
  ): Promise<VehicleOwner> {
    if (dto.owner.ownerId) {
      const existing = await manager.findOne(VehicleOwner, {
        where: { id: dto.owner.ownerId, tenantId },
      });
      if (!existing) {
        throw new NotFoundException(`Owner ${dto.owner.ownerId} not found`);
      }
      return existing;
    }

    if (!dto.owner.fullName) {
      throw new BadRequestException(
        'A vehicle needs a registered keeper: give an existing owner id or a full name.',
      );
    }

    // An owner who has registered before is the SAME owner. Matching on the
    // national ID rather than creating a second row is what keeps "every
    // vehicle this person owns" answerable.
    if (dto.owner.nationalId) {
      const byId = await manager
        .createQueryBuilder(VehicleOwner, 'o')
        .where('o."tenantId" = :tenantId', { tenantId })
        .andWhere('LOWER(o."nationalId") = LOWER(:nationalId)', {
          nationalId: dto.owner.nationalId,
        })
        .getOne();
      if (byId) return byId;
    }

    return manager.save(
      manager.create(VehicleOwner, {
        tenantId,
        kind: dto.owner.kind ?? VehicleOwnerKind.PERSON,
        fullName: dto.owner.fullName,
        nationalId: dto.owner.nationalId ?? null,
        tin: dto.owner.tin ?? null,
        phone: dto.owner.phone ?? null,
        email: dto.owner.email ?? null,
        address: dto.owner.address ?? null,
        zone: dto.owner.zone ?? null,
        woreda: dto.owner.woreda ?? null,
      }),
    );
  }

  private async resolveVehicle(
    manager: EntityManager,
    tenantId: number,
    dto: DraftRegistrationDto,
    klass: VehicleClass,
  ): Promise<Vehicle> {
    const existing = await manager
      .createQueryBuilder(Vehicle, 'v')
      .where('v."tenantId" = :tenantId', { tenantId })
      .andWhere('UPPER(v."vin") = UPPER(:vin)', { vin: dto.vehicle.vin })
      .getOne();

    if (existing) {
      // The chassis is already in the region's records. That is only a refusal
      // if it is currently licensed — a vehicle that was deregistered, or whose
      // registration lapsed, is legitimately being registered again, and it
      // must reuse this row so its history stays one chain.
      const live = await manager
        .createQueryBuilder(VehicleRegistration, 'r')
        .where('r."vehicleId" = :vehicleId', { vehicleId: existing.id })
        .andWhere('r."status" IN (:...statuses)', {
          statuses: [
            VehicleRegistrationStatus.ACTIVE,
            VehicleRegistrationStatus.PENDING_ISSUE,
          ],
        })
        .getOne();

      if (live) {
        throw new ConflictException(
          `Chassis ${dto.vehicle.vin} is already registered in this region${
            live.status === VehicleRegistrationStatus.PENDING_ISSUE
              ? ' and is part-way through registration at an office right now'
              : ''
          }. Use transfer of ownership rather than a new registration.`,
        );
      }

      return existing;
    }

    return manager.save(
      manager.create(Vehicle, {
        tenantId,
        homeBranchId: dto.branchId,
        classId: Number(klass.id),
        vin: dto.vehicle.vin,
        engineNumber: dto.vehicle.engineNumber ?? null,
        make: dto.vehicle.make ?? null,
        model: dto.vehicle.model ?? null,
        modelYear: dto.vehicle.modelYear ?? null,
        colour: dto.vehicle.colour ?? null,
        fuel: dto.vehicle.fuel ?? null,
        seats: dto.vehicle.seats ?? null,
        grossWeightKg: dto.vehicle.grossWeightKg ?? null,
        engineCc: dto.vehicle.engineCc ?? null,
        importRef: dto.vehicle.importRef ?? null,
        presentedPlateNumber: dto.vehicle.presentedPlateNumber ?? null,
        presentedPlateOrigin: dto.vehicle.presentedPlateOrigin ?? null,
        presentedPlateNote: dto.vehicle.presentedPlateNote ?? null,
        chassisCondition: dto.vehicle.chassisCondition ?? null,
      }),
    );
  }

  /**
   * What the desk must be told before it issues a plate to this vehicle.
   *
   * Neither of these blocks registration. Both cars in a duplicate-plate pair
   * are real and both need registering, and refusing would simply send the
   * vehicle away still wearing the fake number. What the clerk gets is the
   * fact, in front of them, at the moment it can still change what they do.
   */
  private async assessPresentedPlate(
    tenantId: number,
    presented: string | null | undefined,
    excludeVehicleId?: number,
  ): Promise<{
    duplicatePresentations: Array<{ vehicleId: number; vin: string }>;
    collidesWithOfficialStock: boolean;
    officialPlateStatus: string | null;
  }> {
    const plate = String(presented || '').trim();
    if (!plate) {
      return {
        duplicatePresentations: [],
        collidesWithOfficialStock: false,
        officialPlateStatus: null,
      };
    }

    // Another vehicle already registered wearing this same number. Two invented
    // plates can carry one number; the registrar needs to know both exist.
    const duplicates = await this.dataSource.query(
      `SELECT v."id" AS "vehicleId", v."vin" AS "vin"
         FROM "pos_vehicles" v
        WHERE v."tenantId" = $1
          AND UPPER(v."presentedPlateNumber") = UPPER($2)
          AND ($3::bigint IS NULL OR v."id" <> $3::bigint)
        LIMIT 5`,
      [tenantId, plate, excludeVehicleId ?? null],
    );

    // The number this car invented is a real blank sitting in a drawer. Issuing
    // it to somebody else would put two cars on the road under one number.
    const official = await this.platesRepository
      .createQueryBuilder('p')
      .where('p."tenantId" = :tenantId', { tenantId })
      .andWhere('UPPER(p."plateNumber") = UPPER(:plate)', { plate })
      .getOne();

    return {
      duplicatePresentations: duplicates ?? [],
      collidesWithOfficialStock: Boolean(official),
      officialPlateStatus: official?.status ?? null,
    };
  }

  /**
   * Withhold a blank whose number is already in circulation unofficially.
   *
   * Called when a vehicle presents an invented plate matching real stock. The
   * blank leaves the allocation pool rather than being destroyed: what to do
   * about a number already on a car is the registrar's decision, and the
   * registry's job is to stop handing it out in the meantime.
   */
  private async quarantinePlate(
    manager: EntityManager,
    tenantId: number,
    plateNumber: string,
    reason: string,
  ) {
    await manager
      .createQueryBuilder()
      .update(VehiclePlate)
      .set({ status: VehiclePlateStatus.QUARANTINED, statusReason: reason })
      .where('"tenantId" = :tenantId', { tenantId })
      .andWhere('UPPER("plateNumber") = UPPER(:plateNumber)', { plateNumber })
      .andWhere('status = :inStock', {
        inStock: VehiclePlateStatus.IN_STOCK,
      })
      .execute();
  }

  /**
   * Complete a registration against the checkout that paid for it.
   *
   * Idempotent on `checkoutId`, backed by a unique index rather than by a
   * check-then-write: a double-submitted settle — the register retrying over a
   * bad connection, a clerk pressing twice — must not mint a second
   * registration or eat a second plate.
   */
  async issueRegistration(
    registrationId: number,
    dto: IssueRegistrationDto,
    actorUserId?: number,
  ) {
    const tenantId = await this.resolveTenantId(dto.branchId);

    const registration = await this.registrationsRepository.findOne({
      where: { id: registrationId, tenantId },
    });
    if (!registration) {
      throw new NotFoundException(`Registration ${registrationId} not found`);
    }

    // Already done. Return it rather than throwing: a retry is not an error,
    // and the desk asking twice should get the same certificate both times.
    if (
      registration.status === VehicleRegistrationStatus.ACTIVE &&
      Number(registration.issuedCheckoutId) === Number(dto.checkoutId)
    ) {
      return registration;
    }

    if (registration.status !== VehicleRegistrationStatus.PENDING_ISSUE) {
      throw new ConflictException(
        `Registration ${registrationId} is ${registration.status} and cannot be issued.`,
      );
    }

    // Payment first: a clerk who mistyped a receipt number should be told the
    // payment is wrong, not that the vehicle is missing. Cheap checks, clear
    // message, before anything else is loaded.
    const paidCheckout = await this.assertCheckoutPaysForThis(
      dto.branchId,
      dto.checkoutId,
      registrationId,
    );

    const vehicle = await this.vehiclesRepository.findOne({
      where: { id: registration.vehicleId, tenantId },
    });
    if (!vehicle) {
      throw new NotFoundException('The vehicle on this registration is gone.');
    }
    const vehicleClass = await this.classesRepository.findOne({
      where: { id: vehicle.classId, tenantId },
    });
    if (!vehicleClass) {
      throw new NotFoundException('The class on this vehicle is gone.');
    }

    this.assertCheckoutCarriesFee(paidCheckout, vehicleClass, dto.checkoutId);

    return this.dataSource.transaction(async (manager) => {
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt);
      expiresAt.setMonth(expiresAt.getMonth() + vehicleClass.renewalMonths);

      registration.status = VehicleRegistrationStatus.ACTIVE;
      registration.issuedAt = issuedAt;
      registration.expiresAt = expiresAt;
      registration.issuedCheckoutId = dto.checkoutId;
      registration.issuedByUserId = actorUserId ?? registration.issuedByUserId;
      registration.verificationCode = await this.mintVerificationCode(manager);
      registration.certificateNumber = `VR-${dto.branchId}-${String(
        registration.id,
      ).padStart(8, '0')}`;

      // Sign for offline verification, once, now. A reprint years later reads
      // this column rather than re-signing, so the original certificate and its
      // duplicate carry an identical QR. Null when no key is configured, which
      // makes the certificate online-only rather than making issuance fail.
      const plateRow = registration.plateId
        ? await manager.findOne(VehiclePlate, {
            where: { id: registration.plateId },
          })
        : null;
      registration.offlineSignature = signCertificate({
        issuedAt,
        expiresAt,
        plateCode: plateRow?.plateCode ?? vehicleClass.plateCode ?? '?',
        regionCode: plateRow?.regionCode ?? SOMALI_REGION_CODE,
        serial: plateRow?.serial ?? 0,
        vin: vehicle.vin,
      });

      await manager.save(registration);

      if (registration.plateId) {
        // ISSUED, not FITTED. The certificate exists; whether the plate reached
        // the car is a separate fact somebody has to confirm.
        await manager.update(
          VehiclePlate,
          { id: registration.plateId },
          { status: VehiclePlateStatus.ISSUED },
        );
      }

      // The paper that covers the vehicle until the plate goes on — minted ONLY
      // when there is a plate to wait for.
      //
      // A permit exists to cover the gap between a number being issued and the
      // metal reaching the car. A registration with no number has no such gap:
      // it is waiting on a federal application, which is not a fitting delay
      // and has no 30-day shape. Handing that citizen a permit that expires in
      // a month would set them up to be stopped at a checkpoint carrying paper
      // that ran out, for a number the Bureau had not yet been granted. Their
      // permit is minted when the number actually arrives — see
      // `assignPlateNumber`, which is where the fitting clock genuinely starts.
      if (registration.plateId) {
        await this.mintInterimPermit(manager, {
          registration,
          tenantId,
          branchId: dto.branchId,
          permitDays: vehicleClass.interimPermitDays ?? 30,
          from: issuedAt,
          actorUserId,
        });
      }

      await this.recordEvent(manager, {
        tenantId,
        branchId: dto.branchId,
        vehicleId: Number(registration.vehicleId),
        registrationId: Number(registration.id),
        type: VehicleEventType.REGISTERED,
        actorUserId,
        checkoutId: dto.checkoutId,
        occurredAt: issuedAt,
        meta: {
          plateId: registration.plateId,
          certificateNumber: registration.certificateNumber,
        },
      });

      if (registration.plateId) {
        await this.recordEvent(manager, {
          tenantId,
          branchId: dto.branchId,
          vehicleId: Number(registration.vehicleId),
          registrationId: Number(registration.id),
          type: VehicleEventType.PLATE_ISSUED,
          actorUserId,
          occurredAt: issuedAt,
          meta: { plateId: registration.plateId },
        });
      }

      return registration;
    });
  }

  /**
   * The fee must be real, settled, this office's, and not already spent on
   * another registration.
   */
  private async assertCheckoutPaysForThis(
    branchId: number,
    checkoutId: number,
    registrationId: number,
  ): Promise<PosCheckout> {
    const checkout = await this.dataSource
      .getRepository(PosCheckout)
      .findOne({ where: { id: checkoutId } });

    if (!checkout) {
      throw new NotFoundException(`Checkout ${checkoutId} not found`);
    }
    if (Number(checkout.branchId) !== Number(branchId)) {
      throw new BadRequestException(
        'That payment was taken at a different office.',
      );
    }
    if (checkout.transactionType !== PosCheckoutTransactionType.SALE) {
      throw new BadRequestException(
        'A registration cannot be issued against a return.',
      );
    }
    if (
      checkout.status === PosCheckoutStatus.VOIDED ||
      checkout.status === PosCheckoutStatus.FAILED ||
      checkout.voidedAt
    ) {
      throw new BadRequestException(
        `That payment is ${checkout.status.toLowerCase()} and cannot pay for a registration.`,
      );
    }

    const alreadySpent = await this.registrationsRepository.findOne({
      where: { issuedCheckoutId: checkoutId },
    });
    // Excluding THIS registration matters: the idempotent-retry path above
    // already returns early for a completed re-issue, but a partially written
    // row that carries the checkout id without being ACTIVE would otherwise
    // collide with itself and could never be finished.
    if (alreadySpent && Number(alreadySpent.id) !== Number(registrationId)) {
      throw new ConflictException(
        `That payment has already issued registration ${alreadySpent.certificateNumber ?? alreadySpent.id}.`,
      );
    }

    return checkout;
  }

  /**
   * And is it actually THIS registration's fee?
   *
   * Everything in assertCheckoutPaysForThis proves the payment is real, unspent
   * and this office's. None of it proves it has anything to do with this
   * vehicle. A clerk typing a receipt number off a till can transpose two
   * digits and land on another customer's settled basket — a different amount,
   * for a different thing — and every check up to here would wave it through,
   * issuing a plate against a payment nobody made for it.
   */
  private assertCheckoutCarriesFee(
    checkout: PosCheckout,
    vehicleClass: VehicleClass | null | undefined,
    checkoutId: number,
  ) {
    // ── And is it actually THIS registration's fee? ────────────────────────
    //
    // Only enforced when the class actually names fee SKUs. A bureau that has
    // not finished pricing its classes should not be blocked from registering;
    // the missing-fee warning on the draft already tells them.
    const expectedSkus = [
      vehicleClass?.registrationFeeSku,
      vehicleClass?.plateFeeSku,
      vehicleClass?.renewalFeeSku,
      vehicleClass?.transferFeeSku,
    ]
      .filter((sku): sku is string => Boolean(sku))
      .map((sku) => sku.toUpperCase());

    if (expectedSkus.length === 0) return;

    const items = Array.isArray(checkout.items) ? checkout.items : [];
    const paidSkus = items
      .map((item: any) => String(item?.sku ?? '').toUpperCase())
      .filter(Boolean);

    const matches = paidSkus.some((sku) => expectedSkus.includes(sku));
    if (!matches) {
      throw new BadRequestException(
        `Payment ${checkout.receiptNumber ?? checkoutId} does not include a registration fee for this class of vehicle. Check the receipt number — this looks like a different sale.`,
      );
    }
  }

  /**
   * 70 bits of Crockford base32, minted server-side.
   *
   * Server-side because the certificate is the Bureau's document, not the
   * device's — unlike a receipt token, which is minted at the register so an
   * offline till can still print something verifiable. Shares the receipt
   * alphabet deliberately: its I/L→1 and O→0 folding is what lets an officer
   * read a code down a phone line without ambiguity.
   */
  private async mintVerificationCode(manager: EntityManager): Promise<string> {
    const alphabet = RECEIPT_VERIFICATION_CODE_ALPHABET;

    for (let attempt = 0; attempt < VERIFICATION_CODE_ATTEMPTS; attempt++) {
      let code = '';
      for (let i = 0; i < VERIFICATION_CODE_LENGTH; i++) {
        code += alphabet[randomInt(alphabet.length)];
      }

      const taken = await manager.findOne(VehicleRegistration, {
        where: { verificationCode: code },
      });
      if (!taken) return code;
    }

    // 70 bits colliding five times running means something is wrong with the
    // entropy source, not with luck. Fail loudly rather than issue a
    // certificate whose QR resolves to somebody else's vehicle.
    throw new ConflictException(
      'Could not mint a unique verification code. Refusing to issue a certificate that might resolve to another vehicle.',
    );
  }

  private async recordEvent(
    manager: EntityManager,
    event: {
      tenantId: number;
      branchId: number;
      vehicleId: number;
      registrationId?: number | null;
      type: VehicleEventType;
      actorUserId?: number | null;
      checkoutId?: number | null;
      reason?: string | null;
      meta?: Record<string, unknown> | null;
      occurredAt: Date;
    },
  ) {
    return manager.save(
      manager.create(VehicleEvent, {
        tenantId: event.tenantId,
        branchId: event.branchId,
        vehicleId: event.vehicleId,
        registrationId: event.registrationId ?? null,
        type: event.type,
        actorUserId: event.actorUserId ?? null,
        checkoutId: event.checkoutId ?? null,
        reason: event.reason ?? null,
        meta: event.meta ?? null,
        occurredAt: event.occurredAt,
      }),
    );
  }

  // ── Plate numbers, when the Ministry grants them ─────────────────────────

  /**
   * The paper that covers a vehicle between its number being issued and the
   * plate reaching the car.
   *
   * Extracted because the clock can start at two different moments. A vehicle
   * plated at the counter starts it at issuance; a vehicle registered without a
   * number starts it months later, when the federal application comes back.
   * Minting from a `from` date rather than `now()` keeps both honest.
   */
  private async mintInterimPermit(
    manager: EntityManager,
    params: {
      registration: VehicleRegistration;
      tenantId: number;
      branchId: number;
      permitDays: number;
      from: Date;
      actorUserId?: number | null;
    },
  ) {
    const { registration, permitDays, from } = params;
    const expires = new Date(from);
    expires.setDate(expires.getDate() + permitDays);

    registration.interimPermitNumber = `IP-${params.branchId}-${String(
      registration.id,
    ).padStart(8, '0')}`;
    registration.interimPermitExpiresAt = expires;
    await manager.save(registration);

    await this.recordEvent(manager, {
      tenantId: params.tenantId,
      branchId: params.branchId,
      vehicleId: Number(registration.vehicleId),
      registrationId: Number(registration.id),
      type: VehicleEventType.INTERIM_PERMIT_ISSUED,
      actorUserId: params.actorUserId ?? null,
      occurredAt: from,
      meta: {
        permitNumber: registration.interimPermitNumber,
        expiresAt: expires.toISOString(),
        days: permitDays,
      },
    });

    return registration;
  }

  /**
   * Give a number to a vehicle that was registered without one.
   *
   * THE EXIT FROM THE WAITING LIST. Every other path sets `plateId` at draft
   * time and never again, so before this existed a registration created with no
   * number could never acquire one: the Bureau could apply to the Federal Trade
   * Ministry, be granted a block, load it as a plate series — and the vehicles
   * that had been waiting for exactly that would go on waiting, because nothing
   * in the codebase could attach a blank to a registration after the fact.
   * "Awaiting number" was a list with no way off it.
   *
   * Three things happen together, and each is load-bearing:
   *
   *  - The plate is taken off the shelf with the same `FOR UPDATE SKIP LOCKED`
   *    statement the counter uses. Two registrars working the backlog on two
   *    machines must not hand one number to two vehicles — which is the exact
   *    fault this registry exists to end.
   *  - The interim permit is minted NOW, not backdated to registration. The
   *    fitting window is the gap between having a number and wearing it, and
   *    that gap opens today. Backdating would hand someone a permit that had
   *    already expired.
   *  - The certificate is re-signed. The offline payload carries the plate
   *    code, region and serial, so a signature minted when the vehicle had no
   *    number attests to no number. Leaving it would print a new certificate
   *    whose QR, verified offline, contradicts the plate on its own face.
   *
   * That last point makes this a NEW certificate rather than a reprint, and the
   * citizen has to be given it — the old paper is not wrong about what it said,
   * it is simply about a vehicle that has since been granted a number.
   */
  async assignPlateNumber(
    registrationId: number,
    branchId: number,
    seriesId?: number | null,
    actorUserId?: number,
  ) {
    const tenantId = await this.resolveTenantId(branchId);

    const registration = await this.registrationsRepository.findOne({
      where: { id: registrationId, tenantId },
    });
    if (!registration) {
      throw new NotFoundException(`Registration ${registrationId} not found`);
    }
    if (registration.status !== VehicleRegistrationStatus.ACTIVE) {
      throw new ConflictException(
        `Registration ${registrationId} is ${registration.status}; only a live registration can be given a number.`,
      );
    }
    // Already has one. Return it rather than throwing: a registrar working a
    // list somebody else has half-cleared is being diligent, not wrong.
    if (registration.plateId) return registration;

    const vehicle = await this.vehiclesRepository.findOne({
      where: { id: registration.vehicleId, tenantId },
    });
    if (!vehicle) {
      throw new NotFoundException('The vehicle on this registration is gone.');
    }
    const vehicleClass = await this.classesRepository.findOne({
      where: { id: vehicle.classId, tenantId },
    });
    if (!vehicleClass) {
      throw new NotFoundException('The class on this vehicle is gone.');
    }

    return this.dataSource.transaction(async (manager) => {
      const plate = await this.allocatePlate(manager, {
        tenantId,
        branchId,
        classId: Number(vehicle.classId),
        registrationId: Number(registration.id),
        seriesId: seriesId ?? null,
      });

      // Here, unlike at the counter, an empty shelf IS the error. Registering a
      // vehicle without a number is the ordinary case and must never be
      // blocked; being asked to hand over a number the office does not have is
      // a registrar clicking on the wrong row, and telling them so is the whole
      // value of the action.
      if (!plate) {
        throw new ConflictException(
          'No plate number is available in this office for that class. Load the block granted by the Federal Trade Ministry as a plate series first.',
        );
      }

      const assignedAt = new Date();

      registration.plateId = Number(plate.id);
      await manager.update(
        VehiclePlate,
        { id: plate.id },
        { status: VehiclePlateStatus.ISSUED },
      );

      // Re-sign: the payload names the plate, so a signature made when there
      // was none no longer describes this certificate.
      registration.offlineSignature = signCertificate({
        issuedAt: registration.issuedAt ?? assignedAt,
        expiresAt: registration.expiresAt ?? assignedAt,
        plateCode: plate.plateCode ?? vehicleClass.plateCode ?? '?',
        regionCode: plate.regionCode ?? SOMALI_REGION_CODE,
        serial: plate.serial ?? 0,
        vin: vehicle.vin,
      });
      await manager.save(registration);

      await this.mintInterimPermit(manager, {
        registration,
        tenantId,
        branchId,
        permitDays: vehicleClass.interimPermitDays ?? 30,
        from: assignedAt,
        actorUserId,
      });

      await this.recordEvent(manager, {
        tenantId,
        branchId,
        vehicleId: Number(registration.vehicleId),
        registrationId: Number(registration.id),
        type: VehicleEventType.PLATE_ISSUED,
        actorUserId,
        occurredAt: assignedAt,
        reason: registration.federalPlateRequestReference,
        meta: {
          plateId: registration.plateId,
          plateNumber: plate.plateNumber,
          afterFederalRequest: Boolean(registration.federalPlateRequestedAt),
        },
      });

      return registration;
    });
  }

  // ── Plate fitment ────────────────────────────────────────────────────────

  /**
   * Record that the plate physically went on the car.
   *
   * A separate act from issuing it, performed by whoever watched it happen.
   * Until this is called the registry knows the vehicle is driving on a number
   * that does not match its record — which is the honest state, and the one the
   * verification page needs in order to stop saying "registered" to an officer
   * looking at a plate that disagrees with it.
   */
  async confirmPlateFitted(
    registrationId: number,
    branchId: number,
    actorUserId?: number,
  ) {
    const tenantId = await this.resolveTenantId(branchId);

    const registration = await this.registrationsRepository.findOne({
      where: { id: registrationId, tenantId },
    });
    if (!registration) {
      throw new NotFoundException(`Registration ${registrationId} not found`);
    }
    if (registration.status !== VehicleRegistrationStatus.ACTIVE) {
      throw new ConflictException(
        `Registration ${registrationId} is ${registration.status}; only a live registration can have a plate fitted.`,
      );
    }
    // Already done. Return it rather than throwing — confirming twice is a
    // clerk being careful, not an error.
    if (registration.plateFittedAt) return registration;
    // There is no plate to fit. Recording one anyway would write a fitment that
    // cannot have happened, and — because the fitting worklist keys off this
    // column — would quietly drop the vehicle off the only list that was going
    // to chase it. The message names the action that actually applies.
    if (!registration.plateId) {
      throw new ConflictException(
        'This vehicle has no plate number yet, so there is nothing to fit. Assign a number to it first.',
      );
    }

    const fittedAt = new Date();

    return this.dataSource.transaction(async (manager) => {
      registration.plateFittedAt = fittedAt;
      registration.plateFittedByUserId = actorUserId ?? null;
      await manager.save(registration);

      if (registration.plateId) {
        await manager.update(
          VehiclePlate,
          { id: registration.plateId },
          { status: VehiclePlateStatus.FITTED },
        );
      }

      await this.recordEvent(manager, {
        tenantId,
        branchId,
        vehicleId: Number(registration.vehicleId),
        registrationId: Number(registration.id),
        type: VehicleEventType.PLATE_FITTED,
        actorUserId,
        occurredAt: fittedAt,
        meta: { plateId: registration.plateId },
      });

      return registration;
    });
  }

  /**
   * Registrations whose plate has not gone on, oldest first.
   *
   * The worklist that turns the fitment gap from a blind spot into something
   * somebody chases. `overdue` is computed against the permit expiry rather
   * than stored, for the same reason registration expiry is: nothing sweeps
   * these rows, so a stored flag would be stale the day after it was written.
   */
  async listAwaitingPlateFitment(branchId: number) {
    const tenantId = await this.resolveTenantId(branchId);
    const now = Date.now();

    const rows = await this.dataSource.query(
      `SELECT r."id"                     AS "registrationId",
              r."certificateNumber"      AS "certificateNumber",
              r."issuedAt"               AS "issuedAt",
              r."interimPermitNumber"    AS "permitNumber",
              r."interimPermitExpiresAt" AS "permitExpiresAt",
              pl."plateNumber"           AS "plateNumber",
              v."vin"                    AS "vin",
              v."presentedPlateNumber"   AS "presentedPlateNumber",
              o."fullName"               AS "ownerName",
              o."phone"                  AS "ownerPhone"
         FROM "pos_vehicle_registrations" r
         JOIN "pos_vehicles" v          ON v."id" = r."vehicleId"
         LEFT JOIN "pos_vehicle_owners" o ON o."id" = r."ownerId"
         LEFT JOIN "pos_vehicle_plates" pl ON pl."id" = r."plateId"
        WHERE r."tenantId" = $1
          AND r."branchId" = $2
          AND r."status" = 'ACTIVE'
          -- A plate must EXIST before it can be waiting to go on. Without this
          -- the list is every plateless registration — which, since a number
          -- comes from a federal application rather than a shelf, is very
          -- nearly the whole register. The office would open its fitting
          -- worklist and find the entire fleet on it, and the two worklists
          -- would not be two lists at all: "awaiting number" would be a subset
          -- of "awaiting fitting" rather than the separate backlog it is.
          AND r."plateId" IS NOT NULL
          AND r."plateFittedAt" IS NULL
        ORDER BY r."interimPermitExpiresAt" ASC NULLS FIRST
        LIMIT 200`,
      [tenantId, branchId],
    );

    return (rows as any[]).map((row) => ({
      ...row,
      overdue: row.permitExpiresAt
        ? new Date(row.permitExpiresAt).getTime() < now
        : false,
      daysWaiting: row.issuedAt
        ? Math.floor((now - new Date(row.issuedAt).getTime()) / 86_400_000)
        : null,
    }));
  }

  /**
   * Record that the Bureau has formally requested a number from the Federal
   * Trade Ministry.
   *
   * Not an allocation, and not something a zonal office can do for itself: a
   * real plate number is obtained by the Bureau applying to the federal
   * ministry. This records that the application was made, with the ministry's
   * reference, so a vehicle waiting on a number can be chased rather than
   * forgotten. The vehicle is already registered and already verifiable — this
   * is only about the number.
   */
  async recordFederalPlateRequest(
    registrationId: number,
    branchId: number,
    reference: string | null | undefined,
    actorUserId?: number,
  ) {
    const tenantId = await this.resolveTenantId(branchId);

    const registration = await this.registrationsRepository.findOne({
      where: { id: registrationId, tenantId },
    });
    if (!registration) {
      throw new NotFoundException(`Registration ${registrationId} not found`);
    }
    if (registration.plateId) {
      throw new ConflictException(
        'This vehicle already has a plate number; there is nothing to request.',
      );
    }
    if (registration.federalPlateRequestedAt) return registration;

    const requestedAt = new Date();

    return this.dataSource.transaction(async (manager) => {
      registration.federalPlateRequestedAt = requestedAt;
      registration.federalPlateRequestReference = reference?.trim() || null;
      registration.federalPlateRequestedByUserId = actorUserId ?? null;
      await manager.save(registration);

      await this.recordEvent(manager, {
        tenantId,
        branchId,
        vehicleId: Number(registration.vehicleId),
        registrationId: Number(registration.id),
        type: VehicleEventType.PLATE_REQUESTED,
        actorUserId,
        reason: registration.federalPlateRequestReference,
        occurredAt: requestedAt,
      });

      return registration;
    });
  }

  /**
   * Registered vehicles with no plate number yet.
   *
   * The office's real backlog. Distinct from the fitment worklist: those have a
   * number and are waiting for the metal, these have no number at all and are
   * waiting on the Bureau.
   */
  async listAwaitingPlateNumber(branchId: number) {
    const tenantId = await this.resolveTenantId(branchId);

    const rows = await this.dataSource.query(
      `SELECT r."id"                   AS "registrationId",
              r."certificateNumber"    AS "certificateNumber",
              r."issuedAt"             AS "issuedAt",
              r."federalPlateRequestedAt"     AS "federalPlateRequestedAt",
              r."federalPlateRequestReference" AS "federalPlateRequestReference",
              v."vin"                  AS "vin",
              v."presentedPlateNumber" AS "presentedPlateNumber",
              v."presentedPlateOrigin" AS "presentedPlateOrigin",
              c."nameEn"               AS "className",
              o."fullName"             AS "ownerName",
              o."phone"                AS "ownerPhone"
         FROM "pos_vehicle_registrations" r
         JOIN "pos_vehicles" v        ON v."id" = r."vehicleId"
         JOIN "pos_vehicle_classes" c ON c."id" = v."classId"
         LEFT JOIN "pos_vehicle_owners" o ON o."id" = r."ownerId"
        WHERE r."tenantId" = $1
          AND r."branchId" = $2
          AND r."status" = 'ACTIVE'
          AND r."plateId" IS NULL
        ORDER BY r."federalPlateRequestedAt" ASC NULLS FIRST, r."issuedAt" ASC
        LIMIT 200`,
      [tenantId, branchId],
    );

    const now = Date.now();
    return (rows as any[]).map((row) => ({
      ...row,
      requested: Boolean(row.federalPlateRequestedAt),
      daysSinceRegistered: row.issuedAt
        ? Math.floor((now - new Date(row.issuedAt).getTime()) / 86_400_000)
        : null,
    }));
  }

  /**
   * What the drive has registered, and what it has collected.
   *
   * Income is a stated purpose of this exercise, not a side effect — the Bureau
   * is bringing unregistered vehicles onto a register AND raising revenue by
   * doing it. So the two numbers belong together: registrations without the
   * money says nothing about whether the drive is paying for itself, and the
   * money without registrations says nothing about coverage.
   *
   * Revenue is read from `pos_checkouts` via the fee SKUs rather than from
   * anything the registry stores. The till is the authority on money; a
   * registry that kept its own copy would be a second set of books, and the two
   * would disagree the first time a sale was voided.
   */
  async getRegistryPerformance(
    branchId: number,
    fromIso?: string,
    toIso?: string,
  ) {
    const tenantId = await this.resolveTenantId(branchId);

    const from = fromIso
      ? new Date(fromIso)
      : new Date(Date.now() - 30 * 86_400_000);
    const to = toIso ? new Date(toIso) : new Date();

    const [registrations] = await this.dataSource.query(
      `SELECT count(*)::int                                            AS "total",
              count(*) FILTER (WHERE r."plateId" IS NULL)::int          AS "withoutNumber",
              count(*) FILTER (WHERE r."federalPlateRequestedAt" IS NOT NULL)::int AS "numberRequested",
              count(*) FILTER (WHERE v."presentedPlateOrigin" = 'UNOFFICIAL')::int AS "arrivedUnofficial",
              count(*) FILTER (WHERE v."presentedPlateOrigin" = 'ZONAL_OFFICE')::int AS "arrivedZonal",
              count(*) FILTER (WHERE v."presentedPlateOrigin" = 'NONE')::int         AS "arrivedNoNumber",
              count(*) FILTER (WHERE v."chassisCondition" = 'TAMPERED')::int         AS "chassisTampered"
         FROM "pos_vehicle_registrations" r
         JOIN "pos_vehicles" v ON v."id" = r."vehicleId"
        WHERE r."tenantId" = $1 AND r."branchId" = $2
          AND r."issuedAt" BETWEEN $3 AND $4`,
      [tenantId, branchId, from, to],
    );

    // Fee income, from the till. Matched on the VR- SKU prefix so a class the
    // bureau adds later is counted without anybody remembering to update this.
    const [revenue] = await this.dataSource.query(
      `SELECT COALESCE(SUM((item->>'lineTotal')::numeric), 0) AS "feeRevenue",
              count(DISTINCT c."id")::int                     AS "paidCheckouts"
         FROM "pos_checkouts" c
         CROSS JOIN LATERAL jsonb_array_elements(c."items") item
        WHERE c."branchId" = $1
          AND c."transactionType" = 'SALE'
          AND c."voidedAt" IS NULL
          AND c."status" <> 'VOIDED'
          AND c."occurredAt" BETWEEN $2 AND $3
          AND UPPER(item->>'sku') LIKE 'VR-%'`,
      [branchId, from, to],
    );

    const byClass = await this.dataSource.query(
      `SELECT c."nameEn" AS "className", count(*)::int AS "registrations"
         FROM "pos_vehicle_registrations" r
         JOIN "pos_vehicles" v        ON v."id" = r."vehicleId"
         JOIN "pos_vehicle_classes" c ON c."id" = v."classId"
        WHERE r."tenantId" = $1 AND r."branchId" = $2
          AND r."issuedAt" BETWEEN $3 AND $4
        GROUP BY c."nameEn"
        ORDER BY count(*) DESC`,
      [tenantId, branchId, from, to],
    );

    return {
      from,
      to,
      registrations: {
        total: registrations?.total ?? 0,
        withoutNumber: registrations?.withoutNumber ?? 0,
        numberRequested: registrations?.numberRequested ?? 0,
      },
      // What the drive is actually finding out there — the reason it exists.
      arrivedWith: {
        unofficial: registrations?.arrivedUnofficial ?? 0,
        zonalOffice: registrations?.arrivedZonal ?? 0,
        noNumber: registrations?.arrivedNoNumber ?? 0,
      },
      // Surfaced beside the money because it is the one number that should
      // never be looked at only in aggregate.
      chassisTampered: registrations?.chassisTampered ?? 0,
      income: {
        feeRevenue: Number(revenue?.feeRevenue ?? 0),
        paidCheckouts: revenue?.paidCheckouts ?? 0,
      },
      byClass,
    };
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  async getRegistration(id: number, branchId: number) {
    const tenantId = await this.resolveTenantId(branchId);
    const registration = await this.registrationsRepository.findOne({
      where: { id, tenantId },
    });
    if (!registration) {
      throw new NotFoundException(`Registration ${id} not found`);
    }

    const [vehicle, owner, plate] = await Promise.all([
      this.vehiclesRepository.findOne({
        where: { id: registration.vehicleId },
      }),
      this.ownersRepository.findOne({ where: { id: registration.ownerId } }),
      registration.plateId
        ? this.platesRepository.findOne({ where: { id: registration.plateId } })
        : Promise.resolve(null),
    ]);

    const vehicleClass = vehicle
      ? await this.classesRepository.findOne({ where: { id: vehicle.classId } })
      : null;

    // Flags come with the record, not on a second request. An officer looking
    // at a vehicle needs to see it is reported stolen in the same glance that
    // shows them the plate — a detail they have to click for is a detail that
    // gets missed at a roadside.
    const flags = vehicle
      ? await this.flagsRepository.find({
          where: { vehicleId: vehicle.id },
          order: { raisedAt: 'DESC' },
        })
      : [];

    return {
      registration,
      vehicle,
      owner,
      plate,
      class: vehicleClass,
      flags,
      openFlags: flags.filter((f) => !f.clearedAt),
    };
  }

  // ── Flags ────────────────────────────────────────────────────────────────

  /**
   * Report a vehicle — stolen, impounded, wanted, held.
   *
   * Deliberately cheap to do: an officer at a checkpoint has seconds and no
   * supervisor. The expensive, supervised action is CLEARING one.
   */
  async raiseFlag(
    params: {
      branchId: number;
      vehicleId: number;
      type: VehicleFlagType;
      reference?: string | null;
      note?: string | null;
    },
    actorUserId?: number,
  ) {
    const tenantId = await this.resolveTenantId(params.branchId);

    const vehicle = await this.vehiclesRepository.findOne({
      where: { id: params.vehicleId, tenantId },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${params.vehicleId} not found`);
    }

    // One open flag of a kind is enough. A second STOLEN report on an already
    // stolen vehicle adds nothing a checkpoint can act on and buries the first.
    const existing = await this.flagsRepository.findOne({
      where: {
        vehicleId: params.vehicleId,
        type: params.type,
        clearedAt: IsNull(),
      },
    });
    if (existing) return existing;

    const raisedAt = new Date();

    return this.dataSource.transaction(async (manager) => {
      const flag = await manager.save(
        manager.create(VehicleFlag, {
          tenantId,
          vehicleId: params.vehicleId,
          type: params.type,
          reference: params.reference ?? null,
          note: params.note ?? null,
          raisedByUserId: actorUserId ?? null,
          raisedAtBranchId: params.branchId,
          raisedAt,
        }),
      );

      await this.recordEvent(manager, {
        tenantId,
        branchId: params.branchId,
        vehicleId: params.vehicleId,
        type: VehicleEventType.FLAGGED,
        actorUserId,
        reason: params.reference ?? params.type,
        meta: { type: params.type, reference: params.reference ?? null },
        occurredAt: raisedAt,
      });

      return flag;
    });
  }

  /**
   * Release a vehicle.
   *
   * A reason is REQUIRED, unlike raising. A cleared flag is how a stolen car
   * becomes sellable, so the record has to say who released it and why — the
   * question a buyer's lawyer asks a year later.
   */
  async clearFlag(
    params: { branchId: number; flagId: number; reason: string },
    actorUserId?: number,
  ) {
    const tenantId = await this.resolveTenantId(params.branchId);

    const reason = String(params.reason || '').trim();
    if (!reason) {
      throw new BadRequestException(
        'Releasing a reported vehicle needs a reason — it is what the record is for.',
      );
    }

    const flag = await this.flagsRepository.findOne({
      where: { id: params.flagId, tenantId },
    });
    if (!flag) {
      throw new NotFoundException(`Flag ${params.flagId} not found`);
    }
    if (flag.clearedAt) return flag;

    const clearedAt = new Date();

    return this.dataSource.transaction(async (manager) => {
      flag.clearedAt = clearedAt;
      flag.clearedByUserId = actorUserId ?? null;
      flag.clearReason = reason;
      await manager.save(flag);

      await this.recordEvent(manager, {
        tenantId,
        branchId: params.branchId,
        vehicleId: Number(flag.vehicleId),
        type: VehicleEventType.FLAG_CLEARED,
        actorUserId,
        reason,
        meta: { type: flag.type, flagId: flag.id },
        occurredAt: clearedAt,
      });

      return flag;
    });
  }

  /** Everything that ever happened to a vehicle, oldest first. */
  async getVehicleHistory(vehicleId: number, branchId: number) {
    const tenantId = await this.resolveTenantId(branchId);

    const vehicle = await this.vehiclesRepository.findOne({
      where: { id: vehicleId, tenantId },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found`);
    }

    const [registrations, events] = await Promise.all([
      this.registrationsRepository.find({
        where: { vehicleId, tenantId },
        order: { createdAt: 'ASC' },
      }),
      this.eventsRepository.find({
        where: { vehicleId, tenantId },
        order: { occurredAt: 'ASC', id: 'ASC' },
      }),
    ]);

    return { vehicle, registrations, events };
  }
}
