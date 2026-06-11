/**
 * Category-driven product attribute schema for the RETAIL POS experience.
 *
 * Each RETAIL category (department or sub-category) can declare the attributes a
 * product in it should carry — e.g. a phone needs Storage, a shirt needs Size and
 * Color. The schema is stored on the `category.attribute_schema` jsonb column and
 * returned by GET /categories/tree, where the POS (pos-s) Seller Hub renders the
 * fields and enforces the required ones, and the Register displays the captured
 * values (product.attributes.specs).
 *
 * Keys are the LIVE category slugs from the production taxonomy (15 departments,
 * GET /api/categories/tree), NOT the stale src/database/seeds/seed-categories.ts
 * file. Base attributes live on a department and are inherited by every
 * sub-category (the client merges parent → child, child keys win), so leaves only
 * add what's specific. Department attributes are kept OPTIONAL; "required" is set
 * at the leaf where it clearly applies (clothing Size/Color, phone Storage, …).
 *
 * This module is the single source of truth for the seeded defaults. Admins can
 * extend/override per category later without code changes.
 */

export type AttributeType = 'select' | 'text' | 'number';

export interface AttributeDef {
  /** Stable machine key stored on the product (attributes.specs[].key). */
  key: string;
  /** Human label shown in the form and on the Register. */
  label: string;
  type: AttributeType;
  /** Allowed values — required for `type: 'select'`. */
  options?: string[];
  /** When true, the POS blocks saving/importing a product until it is filled. */
  required?: boolean;
}

const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const COLOR_OPTIONS = [
  'Black',
  'White',
  'Grey',
  'Red',
  'Blue',
  'Green',
  'Yellow',
  'Orange',
  'Purple',
  'Pink',
  'Brown',
  'Beige',
  'Gold',
  'Silver',
  'Multicolor',
];
const CONDITION_OPTIONS = ['New', 'Refurbished', 'Used'];
const STORAGE_OPTIONS = [
  '16GB',
  '32GB',
  '64GB',
  '128GB',
  '256GB',
  '512GB',
  '1TB',
];
const RAM_OPTIONS = ['2GB', '3GB', '4GB', '6GB', '8GB', '12GB', '16GB', '32GB'];
const UNIT_OPTIONS = [
  'Piece',
  'Kg',
  'Gram',
  'Litre',
  'ml',
  'Bundle',
  'Pack',
  'Crate',
];

const brand = (required = false): AttributeDef => ({
  key: 'brand',
  label: 'Brand',
  type: 'text',
  required,
});
const color = (required = false): AttributeDef => ({
  key: 'color',
  label: 'Color',
  type: 'select',
  options: COLOR_OPTIONS,
  required,
});
const material = (required = false): AttributeDef => ({
  key: 'material',
  label: 'Material',
  type: 'text',
  required,
});
const size = (required = false): AttributeDef => ({
  key: 'size',
  label: 'Size',
  type: 'select',
  options: SIZE_OPTIONS,
  required,
});
const volume = (): AttributeDef => ({
  key: 'volume',
  label: 'Volume / Weight',
  type: 'text',
});
const unit = (): AttributeDef => ({
  key: 'unit',
  label: 'Sold by (unit)',
  type: 'select',
  options: UNIT_OPTIONS,
});

/**
 * Map of LIVE category slug -> attribute definitions. Only RETAIL-relevant
 * departments and sub-categories are listed; classifieds-style departments
 * (Vehicles, Property, Jobs, Services, Community, Education, Construction,
 * Digital Products) intentionally carry no schema.
 */
export const CATEGORY_ATTRIBUTE_SCHEMA: Record<string, AttributeDef[]> = {
  // --- Electronics & Appliances -------------------------------------------
  'electronics-appliances': [
    brand(),
    {
      key: 'condition',
      label: 'Condition',
      type: 'select',
      options: CONDITION_OPTIONS,
    },
  ],
  'mobile-phones-tablets': [
    {
      key: 'storage',
      label: 'Storage',
      type: 'select',
      options: STORAGE_OPTIONS,
      required: true,
    },
    { key: 'ram', label: 'RAM', type: 'select', options: RAM_OPTIONS },
    color(),
  ],
  'computers-laptops': [
    {
      key: 'storage',
      label: 'Storage',
      type: 'select',
      options: STORAGE_OPTIONS,
      required: true,
    },
    {
      key: 'ram',
      label: 'RAM',
      type: 'select',
      options: RAM_OPTIONS,
      required: true,
    },
    color(),
  ],
  'tv-audio-video': [
    { key: 'screenSize', label: 'Screen size (inches)', type: 'number' },
  ],
  'cameras-imaging': [color()],
  'large-appliances-fridges-washers': [color()],
  'small-kitchen-appliances-blenders-etc': [color()],
  'computer-accessories': [color()],

  // --- Fashion & Apparel ---------------------------------------------------
  'fashion-apparel': [brand()],
  'womens-fashion-clothing-shoes': [size(true), color(true), material()],
  'mens-fashion-clothing-shoes': [size(true), color(true), material()],
  'kids-baby-fashion': [
    { key: 'size', label: 'Size', type: 'text', required: true },
    color(),
  ],
  'traditional-cultural-wear': [size(), color(), material()],
  'watches-jewelry': [color(true), material()],
  'bags-luggage': [color(), material()],
  'accessories-belts-scarves-hats': [color(), material()],

  // --- Home, Furniture & Garden -------------------------------------------
  'home-furniture-garden': [color(), material()],
  'furniture-home-decor': [
    material(true),
    color(),
    { key: 'dimensions', label: 'Dimensions (W×D×H)', type: 'text' },
  ],
  'kitchenware-dining': [material(), color()],
  'bedding-bath': [color(), material()],
  'garden-outdoor-supplies': [material()],
  'household-cleaning-supplies': [volume()],

  // --- Health, Beauty & Personal Care -------------------------------------
  'health-beauty-personal-care': [brand()],
  'makeup-cosmetics': [
    { key: 'shade', label: 'Shade', type: 'text' },
    volume(),
  ],
  'skincare-haircare': [volume()],
  'fragrances-perfumes': [volume()],
  'personal-care-appliances': [color()],

  // --- Hobbies, Sports & Kids ---------------------------------------------
  'sports-equipment': [color()],

  // --- Food & Beverages ----------------------------------------------------
  'groceries-essentials': [unit()],
  'fresh-produce-fruits-vegetables': [unit()],
  'meat-dairy': [unit()],
  'packaged-food-drinks': [volume()],
};
