import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The offline signature, stored on the registration.
 *
 * Signed once at issuance rather than recomputed per print, for two reasons.
 * A reprint years later must produce the SAME QR as the original certificate,
 * or the two papers disagree and a checkpoint has no way to tell which is the
 * forgery. And the signing key rotates: recomputing would silently re-sign an
 * old certificate with a new key, which is exactly the audit trail the key id
 * inside the payload exists to preserve.
 *
 * Nullable, and it stays nullable: a registry with no signing key configured
 * still issues certificates, whose QR simply resolves online only.
 */
export class AddCertificateSignature20260821110000 implements MigrationInterface {
  name = 'AddCertificateSignature20260821110000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_registrations"
        ADD COLUMN IF NOT EXISTS "offlineSignature" character varying(256)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_vehicle_registrations"
        DROP COLUMN IF EXISTS "offlineSignature"
    `);
  }
}
