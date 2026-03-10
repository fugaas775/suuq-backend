import dataSource from '../src/data-source';
import { Product } from '../src/products/entities/product.entity';
import { Category } from '../src/categories/entities/category.entity';

type CliOptions = {
  execute: boolean;
  diagnostic: boolean;
  batchSize: number;
  limit?: number;
  targetCategoryId?: number;
};

type TargetCategoryInfo = {
  id: number;
  name: string;
  slug: string;
};

export type ProductProbeSource = Pick<
  Product,
  'name' | 'description' | 'attributes'
>;

const PERSONAL_CARE_KEYWORD_PATTERN =
  /(rexona|deodorant|fragrance|perfume|body\s*spray|antiperspirant|shampoo|conditioner|lotion|soap|cosmetic|beauty|personal\s*care)/i;

const AREA_PRICE_UNIT_PATTERN =
  /^(?:\/?\s*)?(?:m2|m²|sqm|sq\.?m|sqft|ft2|ft²|acre|acres|hectare|hectares)$/i;
const AREA_UNIT_TEXT_PATTERN =
  /((?:\b(?:etb|birr|usd|sos|kes|djf)\b\s*)?\d[\d,\.\s]*\s*(?:\/|per)\s*(?:m2|m²|sqm|sq\.?\s*m|sqft|ft2|ft²|acre|acres|hectare|hectares)\b|(?:\/|per)\s*(?:m2|m²|sqm|sq\.?\s*m|sqft|ft2|ft²|acre|acres|hectare|hectares)\b)/i;
const PROPERTY_PATTERN = /(property|real[-_ ]?estate)/i;
const BEAUTY_PATTERN = /(beauty|personal\s*care|fragrance|perfume|cosmetic)/i;

export function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = {
    execute: false,
    diagnostic: false,
    batchSize: 300,
    limit: undefined,
    targetCategoryId: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--execute') {
      options.execute = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.execute = false;
      continue;
    }

    if (arg === '--diagnostic') {
      options.diagnostic = true;
      continue;
    }

    if (arg === '--batch-size') {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        options.batchSize = Math.min(Math.floor(value), 2000);
      }
      index += 1;
      continue;
    }

    if (arg === '--limit') {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        options.limit = Math.floor(value);
      }
      index += 1;
      continue;
    }

    if (arg === '--target-category-id') {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        options.targetCategoryId = Math.floor(value);
      }
      index += 1;
    }
  }

  return options;
}

function categoryText(category?: Category | null): string {
  if (!category) return '';
  return `${String(category.slug || '')} ${String(category.name || '')}`.toLowerCase();
}

export function isPropertyCategory(category?: Category | null): boolean {
  return PROPERTY_PATTERN.test(categoryText(category));
}

export function isBeautyCategory(category?: Category | null): boolean {
  return BEAUTY_PATTERN.test(categoryText(category));
}

export function hasAreaStylePriceUnit(
  attributes: Record<string, any> | null | undefined,
): boolean {
  if (!attributes || typeof attributes !== 'object') return false;
  const rawUnit = attributes.priceUnit ?? attributes.price_unit;
  if (rawUnit === null || typeof rawUnit === 'undefined') return false;
  return AREA_PRICE_UNIT_PATTERN.test(String(rawUnit).trim());
}

function buildProductProbeText(product: ProductProbeSource): string {
  const attrs =
    product.attributes && typeof product.attributes === 'object'
      ? (product.attributes as Record<string, any>)
      : {};

  return [
    product.name,
    product.description,
    attrs.brand,
    attrs.productName,
    attrs.title,
    attrs.priceText,
    attrs.price_text,
    attrs.unitPriceText,
    attrs.unit_price_text,
    attrs.priceDisplay,
    attrs.price_display,
    JSON.stringify(attrs),
  ]
    .filter((value) => typeof value === 'string' && !!String(value).trim())
    .join(' ');
}

export function isPersonalCareLike(product: ProductProbeSource): boolean {
  const probe = buildProductProbeText(product);

  return PERSONAL_CARE_KEYWORD_PATTERN.test(probe);
}

export function hasAreaUnitTextSignal(product: ProductProbeSource): boolean {
  const probe = buildProductProbeText(product);
  return AREA_UNIT_TEXT_PATTERN.test(probe);
}

export function stripInvalidAreaUnits(
  attrs: Record<string, any> | null | undefined,
): {
  next: Record<string, any>;
  removed: boolean;
} {
  const next =
    attrs && typeof attrs === 'object'
      ? { ...(attrs as Record<string, any>) }
      : {};

  let removed = false;
  if (Object.prototype.hasOwnProperty.call(next, 'priceUnit')) {
    delete next.priceUnit;
    removed = true;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'price_unit')) {
    delete next.price_unit;
    removed = true;
  }

  return { next, removed };
}

function scoreBeautyTarget(category: Category): number {
  const slug = String(category.slug || '').toLowerCase();
  const name = String(category.name || '').toLowerCase();
  const combined = `${slug} ${name}`;

  let score = 0;

  if (/^fragrance[-_]?perfumes?$/.test(slug)) score += 120;
  if (/fragrance|perfume/.test(combined)) score += 80;
  if (/personal[-_ ]?care/.test(combined)) score += 70;
  if (/health[-_ ]?beauty/.test(combined)) score += 65;
  if (/beauty|cosmetic/.test(combined)) score += 50;

  if (isPropertyCategory(category)) score -= 200;

  return score;
}

async function resolveTargetCategory(
  opts: CliOptions,
): Promise<TargetCategoryInfo | null> {
  const categoryRepo = dataSource.getTreeRepository(Category);

  if (opts.targetCategoryId) {
    const explicit = await categoryRepo.findOneBy({
      id: opts.targetCategoryId,
    });
    if (!explicit) {
      throw new Error(`target category id ${opts.targetCategoryId} not found`);
    }
    if (!isBeautyCategory(explicit)) {
      console.warn(
        `Warning: explicit target category (${explicit.id} - ${explicit.slug}) does not look like beauty/fragrance`,
      );
    }
    return { id: explicit.id, name: explicit.name, slug: explicit.slug };
  }

  const allCategories = await categoryRepo.find();
  if (!allCategories.length) return null;

  const ranked = allCategories
    .map((category) => ({ category, score: scoreBeautyTarget(category) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const winner = ranked[0]?.category;
  if (!winner) return null;

  return { id: winner.id, name: winner.name, slug: winner.slug };
}

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));

  await dataSource.initialize();

  const productRepo = dataSource.getRepository(Product);
  const targetCategory = await resolveTargetCategory(options);

  console.log('Starting personal-care/property mismatch cleanup');
  console.log(
    `Mode=${options.execute ? 'EXECUTE' : 'DRY_RUN'} batchSize=${options.batchSize} limit=${options.limit ?? 'none'}`,
  );
  console.log(
    targetCategory
      ? `Target category: ${targetCategory.id} (${targetCategory.slug})`
      : 'Target category: not found (will only strip invalid area units)',
  );

  let cursor = 0;
  let scanned = 0;
  let candidates = 0;
  let updated = 0;
  let recategorized = 0;
  let strippedUnits = 0;
  let diagnosticHits = 0;
  const preview: Array<{
    id: number;
    name: string;
    fromCategory?: string;
    toCategory?: string;
    changed: string[];
    signals?: {
      propertyCategory: boolean;
      beautyCategory: boolean;
      personalCareLike: boolean;
      areaPriceUnit: boolean;
      areaUnitText: boolean;
    };
  }> = [];

  while (true) {
    const rows = await productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.id > :cursor', { cursor })
      .andWhere('product.deletedAt IS NULL')
      .orderBy('product.id', 'ASC')
      .take(options.batchSize)
      .getMany();

    if (!rows.length) break;

    for (const product of rows) {
      scanned += 1;
      cursor = product.id;

      if (options.limit && scanned > options.limit) {
        console.log('Reached --limit; stopping scan');
        break;
      }

      const category = product.category || null;
      const propertyCategory = isPropertyCategory(category);
      const personalCareLike = isPersonalCareLike(product);
      const attrs =
        product.attributes && typeof product.attributes === 'object'
          ? (product.attributes as Record<string, any>)
          : {};

      const hasAreaPriceUnit = hasAreaStylePriceUnit(attrs);
      const hasAreaUnitText = hasAreaUnitTextSignal(product);
      const beautyCategory = isBeautyCategory(category);

      const diagnosticCandidate =
        personalCareLike || hasAreaPriceUnit || hasAreaUnitText;
      if (options.diagnostic && diagnosticCandidate) {
        diagnosticHits += 1;
        if (preview.length < 120) {
          preview.push({
            id: product.id,
            name: String(product.name || ''),
            fromCategory: category
              ? `${category.id}:${category.slug}`
              : 'uncategorized',
            changed: [],
            signals: {
              propertyCategory,
              beautyCategory,
              personalCareLike,
              areaPriceUnit: hasAreaPriceUnit,
              areaUnitText: hasAreaUnitText,
            },
          });
        }
      }

      if (options.diagnostic) {
        continue;
      }

      const shouldFixCategory =
        !!targetCategory &&
        !beautyCategory &&
        personalCareLike &&
        (propertyCategory || hasAreaPriceUnit || hasAreaUnitText) &&
        (!category || category.id !== targetCategory.id);

      const shouldStripPriceUnit =
        hasAreaPriceUnit &&
        (!propertyCategory || personalCareLike || hasAreaUnitText);

      if (!shouldFixCategory && !shouldStripPriceUnit) {
        continue;
      }

      const changed: string[] = [];
      let nextAttrs = attrs;

      if (shouldStripPriceUnit) {
        const stripped = stripInvalidAreaUnits(nextAttrs);
        nextAttrs = stripped.next;
        if (stripped.removed) {
          changed.push('strip_price_unit');
        }
      }

      const updatePayload: Partial<Product> = {};
      if (changed.length > 0) {
        updatePayload.attributes = nextAttrs;
      }

      if (shouldFixCategory && targetCategory) {
        updatePayload.category = { id: targetCategory.id } as Category;
        changed.push('recategorize_to_beauty');
      }

      if (!changed.length) continue;

      candidates += 1;
      if (preview.length < 40) {
        preview.push({
          id: product.id,
          name: String(product.name || ''),
          fromCategory: category
            ? `${category.id}:${category.slug}`
            : 'uncategorized',
          toCategory: shouldFixCategory
            ? `${targetCategory?.id}:${targetCategory?.slug}`
            : undefined,
          changed,
          signals: {
            propertyCategory,
            beautyCategory,
            personalCareLike,
            areaPriceUnit: hasAreaPriceUnit,
            areaUnitText: hasAreaUnitText,
          },
        });
      }

      if (options.execute) {
        if (updatePayload.attributes !== undefined) {
          product.attributes = updatePayload.attributes as Record<string, any>;
        }
        if (shouldFixCategory && targetCategory) {
          product.category = { id: targetCategory.id } as Category;
        }
        await productRepo.save(product);
        updated += 1;
      }

      if (changed.includes('strip_price_unit')) strippedUnits += 1;
      if (changed.includes('recategorize_to_beauty')) recategorized += 1;
    }

    if (options.limit && scanned > options.limit) {
      break;
    }

    if (scanned % 5000 === 0) {
      console.log(
        `Progress scanned=${scanned} candidates=${candidates} updated=${updated}`,
      );
    }
  }

  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }

  console.log('Cleanup finished');
  console.log(
    JSON.stringify(
      {
        scanned,
        candidates,
        updated,
        recategorized,
        strippedUnits,
        diagnosticHits,
        mode: options.execute ? 'EXECUTE' : 'DRY_RUN',
        diagnostic: options.diagnostic,
        targetCategory,
        preview,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  run().catch(async (error) => {
    try {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    } catch {}
    console.error('Cleanup failed', error);
    process.exit(1);
  });
}
