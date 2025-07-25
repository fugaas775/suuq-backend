import { MigrationInterface, QueryRunner } from "typeorm";

export class WithdrawalEntityUpdate1752690169662 implements MigrationInterface {
    name = 'WithdrawalEntityUpdate1752690169662'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."withdrawal_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "withdrawal" ("id" SERIAL NOT NULL, "amount" numeric(10,2) NOT NULL, "status" "public"."withdrawal_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "vendorId" integer, CONSTRAINT "PK_840e247aaad3fbd4e18129122a2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "withdrawal" ADD CONSTRAINT "FK_b0e331b589a5c8a8ef5c5fd864c" FOREIGN KEY ("vendorId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "withdrawal" DROP CONSTRAINT "FK_b0e331b589a5c8a8ef5c5fd864c"`);
        await queryRunner.query(`DROP TABLE "withdrawal"`);
        await queryRunner.query(`DROP TYPE "public"."withdrawal_status_enum"`);
    }

}
