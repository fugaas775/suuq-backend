import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHospitalityWorkflowState1775301000000
  implements MigrationInterface
{
  name = 'CreateHospitalityWorkflowState1775301000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_hospitality_kitchen_tickets" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "ticketId" character varying(128) NOT NULL,
        "serviceFormat" character varying(16) NOT NULL,
        "stationCode" character varying(32) NOT NULL,
        "stationLabel" character varying(128) NOT NULL,
        "state" character varying(32) NOT NULL,
        "queuedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "firedAt" TIMESTAMP WITH TIME ZONE,
        "readyAt" TIMESTAMP WITH TIME ZONE,
        "handedOffAt" TIMESTAMP WITH TIME ZONE,
        "ticketLabel" character varying(255) NOT NULL,
        "receiptId" character varying(128),
        "serviceOwner" character varying(255),
        "tableId" character varying(128),
        "tableLabel" character varying(255),
        "billId" character varying(128),
        "billLabel" character varying(255),
        "lines" jsonb,
        "updatedByUserId" integer,
        "updatedByDisplayName" character varying(255),
        "lastActionReason" text,
        "version" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_hospitality_kitchen_tickets" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_hospitality_kitchen_ticket_branch_ticket" ON "pos_hospitality_kitchen_tickets" ("branchId", "ticketId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hospitality_kitchen_ticket_branch_updated" ON "pos_hospitality_kitchen_tickets" ("branchId", "updatedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hospitality_kitchen_ticket_branch_station" ON "pos_hospitality_kitchen_tickets" ("branchId", "stationCode")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hospitality_kitchen_ticket_branch_state" ON "pos_hospitality_kitchen_tickets" ("branchId", "state")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_hospitality_table_board" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "tableId" character varying(128) NOT NULL,
        "tableLabel" character varying(255) NOT NULL,
        "areaCode" character varying(64) NOT NULL DEFAULT 'MAIN_ROOM',
        "status" character varying(32) NOT NULL DEFAULT 'OPEN',
        "seatCount" integer NOT NULL DEFAULT 4,
        "ownerUserId" integer,
        "ownerDisplayName" character varying(255),
        "activeGuestCount" integer NOT NULL DEFAULT 0,
        "activeBills" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "courseSummary" jsonb NOT NULL DEFAULT '{"ordered":0,"fired":0,"ready":0,"served":0}'::jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_hospitality_table_board" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_hospitality_table_board_branch_table" ON "pos_hospitality_table_board" ("branchId", "tableId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hospitality_table_board_branch_updated" ON "pos_hospitality_table_board" ("branchId", "updatedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hospitality_table_board_branch_status" ON "pos_hospitality_table_board" ("branchId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hospitality_table_board_branch_area" ON "pos_hospitality_table_board" ("branchId", "areaCode")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_hospitality_bill_interventions" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "interventionId" character varying(128) NOT NULL,
        "billId" character varying(128) NOT NULL,
        "billLabel" character varying(255) NOT NULL,
        "tableId" character varying(128),
        "tableLabel" character varying(255),
        "receiptId" character varying(128),
        "receiptNumber" character varying(128),
        "actionType" character varying(16) NOT NULL,
        "lifecycleStatus" character varying(32) NOT NULL,
        "serviceOwner" character varying(255),
        "itemCount" integer NOT NULL DEFAULT 0,
        "total" numeric(12,2) NOT NULL DEFAULT 0,
        "currency" character varying(8) NOT NULL DEFAULT 'ETB',
        "reason" text,
        "priority" character varying(16) NOT NULL,
        "actorUserId" integer,
        "actorDisplayName" character varying(255),
        "version" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_hospitality_bill_interventions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_hospitality_bill_intervention_branch_bill" ON "pos_hospitality_bill_interventions" ("branchId", "billId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hospitality_bill_intervention_branch_updated" ON "pos_hospitality_bill_interventions" ("branchId", "updatedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hospitality_bill_intervention_branch_action" ON "pos_hospitality_bill_interventions" ("branchId", "actionType")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hospitality_bill_intervention_branch_priority" ON "pos_hospitality_bill_interventions" ("branchId", "priority")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_hospitality_idempotency_keys" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "idempotencyKey" character varying(255) NOT NULL,
        "responsePayload" jsonb NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_hospitality_idempotency_keys" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_hospitality_idempotency_branch_key" ON "pos_hospitality_idempotency_keys" ("branchId", "idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pos_hospitality_idempotency_branch_created" ON "pos_hospitality_idempotency_keys" ("branchId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_hospitality_idempotency_keys"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_hospitality_bill_interventions"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_hospitality_table_board"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_hospitality_kitchen_tickets"`,
    );
  }
}
