import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFeedInteraction1772191639886 implements MigrationInterface {
  name = 'AddFeedInteraction1772191639886';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "feed_interactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "requestId" character varying(255), "productId" character varying(255) NOT NULL, "action" character varying(50) NOT NULL, "userId" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4f965cda810ebb3ee36c1ff6bb1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_06f8ed4b9d949fe07dace0a791" ON "feed_interactions" ("requestId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_18594ccbcb503d166ac8e00ee1" ON "feed_interactions" ("productId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e1e8cb6f0c2a0083c6518e67d7" ON "feed_interactions" ("action") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e1e8cb6f0c2a0083c6518e67d7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_18594ccbcb503d166ac8e00ee1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_06f8ed4b9d949fe07dace0a791"`,
    );
    await queryRunner.query(`DROP TABLE "feed_interactions"`);
  }
}
