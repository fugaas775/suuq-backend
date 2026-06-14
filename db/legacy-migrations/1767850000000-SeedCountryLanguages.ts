import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedCountryLanguages1767850000000 implements MigrationInterface {
  name = 'SeedCountryLanguages1767850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update existing countries
    await queryRunner.query(
      `UPDATE "country" SET "defaultLanguage" = 'am' WHERE "name" = 'Ethiopia'`,
    );
    await queryRunner.query(
      `UPDATE "country" SET "defaultLanguage" = 'sw' WHERE "name" = 'Kenya'`,
    );
    await queryRunner.query(
      `UPDATE "country" SET "defaultLanguage" = 'en' WHERE "name" = 'Uganda'`,
    );
    await queryRunner.query(
      `UPDATE "country" SET "defaultLanguage" = 'sw' WHERE "name" = 'Tanzania'`,
    );
    await queryRunner.query(
      `UPDATE "country" SET "defaultLanguage" = 'en' WHERE "name" = 'Rwanda'`,
    );

    // Somalia
    const somalia = (await queryRunner.query(
      `SELECT id FROM "country" WHERE "name" = 'Somalia'`,
    )) as any[];
    if (somalia.length === 0) {
      await queryRunner.query(
        `INSERT INTO "country" ("name", "flagUrl", "imageUrl", "description", "defaultLanguage", "supplies")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'Somalia',
          'https://flagcdn.com/w320/so.png',
          'https://images.unsplash.com/photo-1627394833282-3e3c0326e279?w=800',
          'Somalia is known for its longest coastline in mainland Africa and rich poetry culture.',
          'so',
          JSON.stringify([
            {
              name: 'Bananas',
              icon: '🍌',
              fact: 'Somalia is known for its sweet, small bananas exported worldwide.',
            },
            {
              name: 'Frankincense',
              icon: '🌲',
              fact: 'Somalia is one of the largest producers of frankincense in the world.',
            },
          ]),
        ],
      );
    } else {
      await queryRunner.query(
        `UPDATE "country" SET "defaultLanguage" = 'so' WHERE "name" = 'Somalia'`,
      );
    }

    // Djibouti
    const djibouti = (await queryRunner.query(
      `SELECT id FROM "country" WHERE "name" = 'Djibouti'`,
    )) as any[];
    if (djibouti.length === 0) {
      await queryRunner.query(
        `INSERT INTO "country" ("name", "flagUrl", "imageUrl", "description", "defaultLanguage", "supplies")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'Djibouti',
          'https://flagcdn.com/w320/dj.png',
          'https://images.unsplash.com/photo-1589569656209-4c8d55c70624?w=800',
          'Djibouti serves as a key trade gateway in the Horn of Africa, known for its unique geological landscapes.',
          'fr',
          JSON.stringify([
            {
              name: 'Salt',
              icon: '🧂',
              fact: "Lake Assal is the world's largest salt reserve.",
            },
          ]),
        ],
      );
    } else {
      await queryRunner.query(
        `UPDATE "country" SET "defaultLanguage" = 'fr' WHERE "name" = 'Djibouti'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "country" SET "defaultLanguage" = 'en' WHERE "name" IN ('Ethiopia', 'Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Somalia', 'Djibouti')`,
    );
    // Note: We don't delete the new countries in down migration to avoid data loss if they were used.
  }
}
