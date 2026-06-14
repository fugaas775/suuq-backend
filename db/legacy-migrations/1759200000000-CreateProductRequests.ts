import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductRequests1759200000000 implements MigrationInterface {
  name = 'CreateProductRequests1759200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_request_status_enum') THEN
          CREATE TYPE product_request_status_enum AS ENUM ('OPEN','IN_PROGRESS','FULFILLED','CANCELLED','EXPIRED');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_request_condition_enum') THEN
          CREATE TYPE product_request_condition_enum AS ENUM ('ANY','NEW','USED');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_request_urgency_enum') THEN
          CREATE TYPE product_request_urgency_enum AS ENUM ('FLEXIBLE','THIS_WEEK','IMMEDIATE');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_request_offer_status_enum') THEN
          CREATE TYPE product_request_offer_status_enum AS ENUM ('SENT','SEEN','ACCEPTED','REJECTED','WITHDRAWN','EXPIRED');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS product_request (
        id SERIAL PRIMARY KEY,
        buyer_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        category_id INTEGER NULL REFERENCES category(id) ON DELETE SET NULL,
        title VARCHAR(180) NOT NULL,
        description TEXT NULL,
        budget_min NUMERIC(12,2) NULL,
        budget_max NUMERIC(12,2) NULL,
        currency VARCHAR(3) NULL,
        condition product_request_condition_enum NOT NULL DEFAULT 'ANY',
        urgency product_request_urgency_enum NOT NULL DEFAULT 'FLEXIBLE',
        preferred_city VARCHAR(128) NULL,
        preferred_country VARCHAR(2) NULL,
        image_url VARCHAR(255) NULL,
        status product_request_status_enum NOT NULL DEFAULT 'OPEN',
        expires_at TIMESTAMP NULL,
        closed_at TIMESTAMP NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        accepted_offer_id INTEGER NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS product_request_offer (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES product_request(id) ON DELETE CASCADE,
        seller_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        product_id INTEGER NULL REFERENCES product(id) ON DELETE SET NULL,
        price NUMERIC(12,2) NULL,
        currency VARCHAR(3) NULL,
        message TEXT NULL,
        status product_request_offer_status_enum NOT NULL DEFAULT 'SENT',
        expires_at TIMESTAMP NULL,
        seen_at TIMESTAMP NULL,
        responded_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_product_request_status ON product_request(status);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_product_request_buyer ON product_request(buyer_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_product_request_category ON product_request(category_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_product_request_offer_request ON product_request_offer(request_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_product_request_offer_seller ON product_request_offer(seller_id);`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.constraint_column_usage
          WHERE table_name = 'product_request' AND constraint_name = 'fk_product_request_accepted_offer'
        ) THEN
          ALTER TABLE product_request
          ADD CONSTRAINT fk_product_request_accepted_offer
          FOREIGN KEY (accepted_offer_id)
          REFERENCES product_request_offer(id)
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE search_keyword
        ADD COLUMN IF NOT EXISTS zero_results_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_zero_results_at TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS last_zero_results_city VARCHAR(128) NULL,
        ADD COLUMN IF NOT EXISTS last_zero_results_country VARCHAR(2) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE search_keyword
        DROP COLUMN IF EXISTS last_zero_results_country,
        DROP COLUMN IF EXISTS last_zero_results_city,
        DROP COLUMN IF EXISTS last_zero_results_at,
        DROP COLUMN IF EXISTS zero_results_count;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.constraint_column_usage
          WHERE table_name = 'product_request' AND constraint_name = 'fk_product_request_accepted_offer'
        ) THEN
          ALTER TABLE product_request DROP CONSTRAINT fk_product_request_accepted_offer;
        END IF;
      END $$;
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS product_request_offer;`);
    await queryRunner.query(`DROP TABLE IF EXISTS product_request;`);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_request_offer_status_enum') THEN
          DROP TYPE product_request_offer_status_enum;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_request_status_enum') THEN
          DROP TYPE product_request_status_enum;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_request_condition_enum') THEN
          DROP TYPE product_request_condition_enum;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_request_urgency_enum') THEN
          DROP TYPE product_request_urgency_enum;
        END IF;
      END $$;
    `);
  }
}
