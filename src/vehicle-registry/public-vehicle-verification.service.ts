import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { normalizeReceiptVerificationCode } from '../pos-sync/receipt-verification-code';
import { VehicleRegistration } from './entities/vehicle-registration.entity';

/**
 * What a stranger holding a certificate — or standing behind a car — is told.
 *
 * The audience is a traffic officer at a checkpoint and a buyer in a used-car
 * market, neither of whom has an account. The question they get answered is
 * "is this vehicle legally registered", and deliberately NOT "who owns it".
 *
 * ── The privacy line ────────────────────────────────────────────────────────
 *
 * Owner name, national ID, phone and address are never returned here, and the
 * chassis number is truncated to its last four characters. A plate-to-owner
 * lookup open to anyone with a phone is a stalking tool — it turns every car
 * park into a directory of where people are. An officer who needs the keeper's
 * name signs in; that is what the authenticated lookup is for.
 *
 * The truncated VIN still does the job it is there for: someone comparing the
 * certificate in their hand against the stamped chassis can confirm the last
 * four match, which is what catches a plate moved onto a different car.
 */

export type PublicVehicleStatus =
  | 'VALID'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'NOT_REGISTERED'
  | 'DEREGISTERED'
  | 'PENDING';

export interface PublicVehicleResult {
  found: boolean;
  status: PublicVehicleStatus;
  plateNumber?: string | null;
  plateCode?: string | null;
  regionCode?: string | null;
  plateBackgroundColour?: string | null;
  plateTextColour?: string | null;
  className?: string | null;
  make?: string | null;
  model?: string | null;
  modelYear?: number | null;
  colour?: string | null;
  vinLast4?: string | null;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  issuingOffice?: string | null;
  certificateNumber?: string | null;
  /** True when the vehicle carries an open flag. Detail is withheld. */
  flagged?: boolean;
}

const NOT_FOUND: PublicVehicleResult = { found: false, status: 'NOT_REGISTERED' };

@Injectable()
export class PublicVehicleVerificationService {
  constructor(
    @InjectRepository(VehicleRegistration)
    private readonly registrationsRepository: Repository<VehicleRegistration>,
    private readonly dataSource: DataSource,
  ) {}

  /** Resolve the token printed in a certificate's QR. */
  async verifyByCode(rawCode: string): Promise<PublicVehicleResult> {
    const code = normalizeReceiptVerificationCode(rawCode);
    if (!code) return NOT_FOUND;
    const rows = await this.query(`r."verificationCode" = $1`, [code]);
    return this.present(rows?.[0]);
  }

  /**
   * Resolve a plate number typed by a person.
   *
   * Enumerable by design — plates are sequential and public, and anyone can
   * read one off a bumper. That is precisely why the payload carries nothing
   * personal: the defence is what is NOT returned, not the difficulty of
   * guessing an input that is written on the outside of the car.
   */
  async verifyByPlate(rawPlate: string): Promise<PublicVehicleResult> {
    const plate = String(rawPlate || '').trim();
    if (!plate) return NOT_FOUND;
    const rows = await this.query(`UPPER(pl."plateNumber") = UPPER($1)`, [plate]);
    return this.present(rows?.[0]);
  }

  private async query(predicate: string, params: unknown[]) {
    return this.dataSource.query(
      `
      SELECT r."status"            AS "status",
             r."issuedAt"          AS "issuedAt",
             r."expiresAt"         AS "expiresAt",
             r."certificateNumber" AS "certificateNumber",
             pl."plateNumber"      AS "plateNumber",
             pl."plateCode"        AS "plateCode",
             pl."regionCode"       AS "regionCode",
             v."vin"               AS "vin",
             v."make"              AS "make",
             v."model"             AS "model",
             v."modelYear"         AS "modelYear",
             v."colour"            AS "colour",
             c."nameEn"            AS "classNameEn",
             c."nameSo"            AS "classNameSo",
             c."plateBackgroundColour" AS "plateBackgroundColour",
             c."plateTextColour"       AS "plateTextColour",
             b."name"              AS "issuingOffice",
             EXISTS (
               SELECT 1 FROM "pos_vehicle_flags" f
                WHERE f."vehicleId" = v."id" AND f."clearedAt" IS NULL
             )                     AS "flagged"
        FROM "pos_vehicle_registrations" r
        JOIN "pos_vehicles" v            ON v."id"  = r."vehicleId"
        JOIN "pos_vehicle_classes" c     ON c."id"  = v."classId"
        LEFT JOIN "pos_vehicle_plates" pl ON pl."id" = r."plateId"
        LEFT JOIN "branches" b            ON b."id"  = r."branchId"
       WHERE ${predicate}
       ORDER BY r."issuedAt" DESC NULLS LAST
       LIMIT 1
      `,
      params,
    );
  }

  private present(row: any): PublicVehicleResult {
    if (!row) return NOT_FOUND;

    const vin = String(row.vin || '');

    return {
      found: true,
      status: this.resolveStatus(row),
      plateNumber: row.plateNumber ?? null,
      plateCode: row.plateCode ?? null,
      regionCode: row.regionCode ?? null,
      plateBackgroundColour: row.plateBackgroundColour ?? null,
      plateTextColour: row.plateTextColour ?? null,
      className: row.classNameSo
        ? `${row.classNameSo} / ${row.classNameEn}`
        : row.classNameEn ?? null,
      make: row.make ?? null,
      model: row.model ?? null,
      modelYear: row.modelYear ?? null,
      colour: row.colour ?? null,
      // Last four only — enough to check the certificate against the stamped
      // chassis, not enough to be a vehicle-history lookup key.
      vinLast4: vin ? vin.slice(-4) : null,
      issuedAt: row.issuedAt ?? null,
      expiresAt: row.expiresAt ?? null,
      issuingOffice: row.issuingOffice ?? null,
      certificateNumber: row.certificateNumber ?? null,
      flagged: row.flagged === true,
    };
  }

  /**
   * Expiry is computed from the DATE, never read from the status column.
   *
   * Nothing sweeps registrations to EXPIRED — there is no nightly job — so a
   * licence that ran out last month still says ACTIVE in the database. Trusting
   * that column would tell a checkpoint a lapsed vehicle is valid, which is the
   * one answer this page must never give.
   */
  private resolveStatus(row: any): PublicVehicleStatus {
    const status = String(row.status || '').toUpperCase();

    if (status === 'SUSPENDED') return 'SUSPENDED';
    if (status === 'DEREGISTERED' || status === 'TRANSFERRED') {
      return 'DEREGISTERED';
    }
    if (status === 'PENDING_ISSUE') return 'PENDING';

    if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
      return 'EXPIRED';
    }

    return status === 'ACTIVE' ? 'VALID' : 'NOT_REGISTERED';
  }
}
