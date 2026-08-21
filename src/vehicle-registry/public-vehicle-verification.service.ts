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
  /** Registered, plate not yet fitted, interim permit still valid. */
  | 'AWAITING_PLATE'
  /** Registered, plate not fitted, and the permit has run out. */
  | 'PLATE_OVERDUE'
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
  /**
   * True when the number typed was the one the vehicle USED to wear, not the
   * plate the Bureau issued.
   *
   * During the regularisation drive most cars on the road are still carrying
   * their old number, so this is the common case rather than the exception —
   * and the reader has to be told plainly that the plate on the bumper is not
   * the plate on the record.
   */
  matchedOnPreviousNumber?: boolean;
  previousPlateNumber?: string | null;
  /** When the plate went on. Null while the vehicle is still on its old one. */
  plateFittedAt?: Date | null;
  interimPermitExpiresAt?: Date | null;
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

    // The issued plate first.
    const issued = await this.query(`UPPER(pl."plateNumber") = UPPER($1)`, [plate]);
    if (issued?.[0]) return this.present(issued[0]);

    // Then the number the vehicle used to wear. This is not a fallback for
    // completeness — during the drive most cars on the road still carry their
    // old number, so an officer reading a bumper types THIS one. A portal that
    // only knew plates we had issued would be useless for most of the fleet it
    // is meant to cover.
    const previous = await this.query(
      `UPPER(COALESCE(v."presentedPlateNumber", '')) = UPPER($1)`,
      [plate],
    );
    if (!previous?.[0]) return NOT_FOUND;

    return {
      ...this.present(previous[0]),
      matchedOnPreviousNumber: true,
      previousPlateNumber: previous[0].presentedPlateNumber ?? plate,
    };
  }

  private async query(predicate: string, params: unknown[]) {
    return this.dataSource.query(
      `
      SELECT r."status"            AS "status",
             r."issuedAt"          AS "issuedAt",
             r."expiresAt"         AS "expiresAt",
             r."certificateNumber" AS "certificateNumber",
             r."plateFittedAt"     AS "plateFittedAt",
             r."interimPermitExpiresAt" AS "interimPermitExpiresAt",
             pl."plateNumber"      AS "plateNumber",
             pl."plateCode"        AS "plateCode",
             pl."regionCode"       AS "regionCode",
             v."vin"               AS "vin",
             v."make"              AS "make",
             v."model"             AS "model",
             v."modelYear"         AS "modelYear",
             v."colour"            AS "colour",
             v."presentedPlateNumber" AS "presentedPlateNumber",
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
      plateFittedAt: row.plateFittedAt ?? null,
      interimPermitExpiresAt: row.interimPermitExpiresAt ?? null,
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

    if (status !== 'ACTIVE') return 'NOT_REGISTERED';

    // Registered, but has the plate actually gone on? Saying "registered" to an
    // officer looking at a plate that does not match the record tells them
    // something misleading — and the gap between the two is exactly where a
    // stolen vehicle is easiest to move.
    if (!row.plateFittedAt) {
      const permitExpiry = row.interimPermitExpiresAt
        ? new Date(row.interimPermitExpiresAt).getTime()
        : null;
      // Overdue, not unlawful. The office may simply not have produced the
      // plate yet, and a driver should not carry the consequence of that.
      if (permitExpiry !== null && permitExpiry < Date.now()) {
        return 'PLATE_OVERDUE';
      }
      return 'AWAITING_PLATE';
    }

    return 'VALID';
  }
}
