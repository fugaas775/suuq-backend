import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds performance indexes for search keyword analytics and optional pg_trgm index for fuzzy/substring search.
 * Safe to run multiple times (IF NOT EXISTS guards).
 *
 * NOTE: Ensure the pg_trgm extension is available (CREATE EXTENSION IF NOT EXISTS pg_trgm;)
 */
export class AddSearchKeywordIndexes1759100000000 implements MigrationInterface {
  name = 'AddSearchKeywordIndexes1759100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Btree indexes for ordering / filtering
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_search_keyword_submit_last" ON "search_keyword" (submit_count DESC, last_seen_at DESC)'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_search_keyword_last_seen_at" ON "search_keyword" (last_seen_at DESC)'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_search_keyword_last_city" ON "search_keyword" (last_city)'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_search_keyword_last_vendor_name" ON "search_keyword" (last_vendor_name)'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_search_keyword_last_country" ON "search_keyword" (last_country)'
    );

    // Trigram index for ILIKE substring search (optional; will no-op if extension missing)
    try {
      await queryRunner.query(
        'CREATE EXTENSION IF NOT EXISTS pg_trgm'
      );
      await queryRunner.query(
        'CREATE INDEX IF NOT EXISTS "IDX_search_keyword_qnorm_trgm" ON "search_keyword" USING GIN (q_norm gin_trgm_ops)'
      );
    } catch (e: any) {
      // Log but do not fail migration if extension cannot be created (e.g., insufficient privileges)
      console.warn('Skipping pg_trgm index creation:', e?.message || e);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_search_keyword_qnorm_trgm"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_search_keyword_last_country"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_search_keyword_last_vendor_name"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_search_keyword_last_city"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_search_keyword_last_seen_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_search_keyword_submit_last"');
  }
}
