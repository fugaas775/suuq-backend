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
 * This module is the single source of truth for the seeded defaults: the seed
 * runner (seed-category-attributes.ts) writes these onto categories by slug, and
 * the unit test validates the shape. Admins can extend/override per category
 * later via the category admin surface without code changes.
 *
 * Departments inherit down to their sub-categories on the client: a sub-category's
 * schema is MERGED on top of its parent department's (child keys win), so common
 * attributes can live on the department and specifics on the leaf.
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

/**
 * Map of category slug -> attribute definitions. Slugs match
 * src/database/seeds/seed-categories.ts. Only RETAIL-relevant departments and
 * their sub-categories are listed; classifieds-style departments (Vehicles,
 * Property, Jobs, Services, Education, Community) intentionally carry no schema.
 */
export const CATEGORY_ATTRIBUTE_SCHEMA: Record<string, AttributeDef[]> = {
  // --- Electronics ---------------------------------------------------------
  electronics: [
    { key: 'brand', label: 'Brand', type: 'text', required: true },
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
    { key: 'color', label: 'Color', type: 'select', options: COLOR_OPTIONS },
  ],
  'laptops-computers': [
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
    { key: 'color', label: 'Color', type: 'select', options: COLOR_OPTIONS },
  ],
  'tvs-video-audio': [
    { key: 'screenSize', label: 'Screen size (inches)', type: 'number' },
  ],
  'home-appliances': [
    { key: 'color', label: 'Color', type: 'select', options: COLOR_OPTIONS },
  ],

  // --- Fashion & Beauty ----------------------------------------------------
  'fashion-beauty': [{ key: 'brand', label: 'Brand', type: 'text' }],
  'fashion-men': [
    {
      key: 'size',
      label: 'Size',
      type: 'select',
      options: SIZE_OPTIONS,
      required: true,
    },
    {
      key: 'color',
      label: 'Color',
      type: 'select',
      options: COLOR_OPTIONS,
      required: true,
    },
    { key: 'material', label: 'Material', type: 'text' },
  ],
  'fashion-women': [
    {
      key: 'size',
      label: 'Size',
      type: 'select',
      options: SIZE_OPTIONS,
      required: true,
    },
    {
      key: 'color',
      label: 'Color',
      type: 'select',
      options: COLOR_OPTIONS,
      required: true,
    },
    { key: 'material', label: 'Material', type: 'text' },
  ],
  'fashion-accessories': [
    {
      key: 'color',
      label: 'Color',
      type: 'select',
      options: COLOR_OPTIONS,
      required: true,
    },
    { key: 'material', label: 'Material', type: 'text' },
  ],
  'health-beauty-products': [
    { key: 'shade', label: 'Shade', type: 'text' },
    { key: 'volume', label: 'Volume / Weight', type: 'text' },
  ],

  // --- Home & Garden -------------------------------------------------------
  'home-garden': [
    { key: 'color', label: 'Color', type: 'select', options: COLOR_OPTIONS },
    { key: 'material', label: 'Material', type: 'text' },
  ],
  furniture: [
    { key: 'material', label: 'Material', type: 'text', required: true },
    { key: 'color', label: 'Color', type: 'select', options: COLOR_OPTIONS },
    { key: 'dimensions', label: 'Dimensions (W×D×H)', type: 'text' },
  ],
  kitchenware: [
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'color', label: 'Color', type: 'select', options: COLOR_OPTIONS },
  ],
  'home-decor': [
    { key: 'color', label: 'Color', type: 'select', options: COLOR_OPTIONS },
    { key: 'material', label: 'Material', type: 'text' },
  ],
  'garden-outdoor': [{ key: 'material', label: 'Material', type: 'text' }],

  // --- Agriculture & Food --------------------------------------------------
  'fresh-produce': [
    {
      key: 'unit',
      label: 'Sold by (unit)',
      type: 'select',
      options: ['Piece', 'Kg', 'Gram', 'Litre', 'Bundle', 'Crate'],
    },
  ],
};
