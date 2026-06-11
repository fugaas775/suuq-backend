import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from '../../categories/entities/category.entity';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { CATEGORY_ATTRIBUTE_SCHEMA } from '../../categories/category-attribute-schema';

/**
 * Idempotently writes the RETAIL product attribute schema (Size, Color, Storage,
 * …) onto existing categories by slug. Safe to re-run; only touches the slugs in
 * CATEGORY_ATTRIBUTE_SCHEMA and never clears the category table. Run AFTER
 * seed:categories and after the AddCategoryAttributeSchema migration.
 *
 *   yarn seed:category-attributes
 */
async function bootstrap() {
  const logger = new Logger('SeedCategoryAttributes');
  const app = await NestFactory.createApplicationContext(AppModule);
  const categoryRepo = app.get<Repository<Category>>(
    getRepositoryToken(Category),
  );

  logger.log('--- Seeding RETAIL category attribute schemas ---');

  let updated = 0;
  let missing = 0;
  for (const [slug, schema] of Object.entries(CATEGORY_ATTRIBUTE_SCHEMA)) {
    const result = await categoryRepo.update(
      { slug },
      { attributeSchema: schema },
    );
    if (result.affected && result.affected > 0) {
      updated += 1;
      logger.log(`✅ ${slug} (${schema.length} attribute(s))`);
    } else {
      missing += 1;
      logger.warn(`⚠️  category slug not found, skipped: ${slug}`);
    }
  }

  logger.log(
    `🎉 Attribute seeding complete — ${updated} updated, ${missing} missing.`,
  );
  await app.close();
}

void bootstrap();
