import {
  CATEGORY_ATTRIBUTE_SCHEMA,
  AttributeDef,
} from './category-attribute-schema';

describe('CATEGORY_ATTRIBUTE_SCHEMA', () => {
  const entries = Object.entries(CATEGORY_ATTRIBUTE_SCHEMA);

  it('defines at least the core RETAIL departments', () => {
    expect(Object.keys(CATEGORY_ATTRIBUTE_SCHEMA)).toEqual(
      expect.arrayContaining([
        'electronics',
        'mobile-phones-tablets',
        'fashion-men',
        'fashion-women',
        'furniture',
      ]),
    );
  });

  it('uses slugs that are non-empty kebab-case strings', () => {
    for (const [slug] of entries) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('every attribute is well-formed with a unique key per category', () => {
    for (const [slug, defs] of entries) {
      expect(Array.isArray(defs)).toBe(true);
      expect(defs.length).toBeGreaterThan(0);

      const keys = new Set<string>();
      for (const def of defs) {
        expect(def.key).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
        expect(typeof def.label).toBe('string');
        expect(def.label.trim().length).toBeGreaterThan(0);
        expect(['select', 'text', 'number']).toContain(def.type);

        // keys are unique within a category
        expect(keys.has(def.key)).toBe(false);
        keys.add(def.key);

        // selects must carry non-empty, unique options
        if (def.type === 'select') {
          expect(Array.isArray(def.options)).toBe(true);
          expect(def.options.length).toBeGreaterThan(0);
          expect(new Set(def.options).size).toBe(def.options.length);
        } else {
          expect(def.options).toBeUndefined();
        }
      }
    }
  });

  it('marks clothing Size + Color as required (drives POS blocking)', () => {
    for (const slug of ['fashion-men', 'fashion-women']) {
      const defs = CATEGORY_ATTRIBUTE_SCHEMA[slug];
      const required = defs.filter((d) => d.required).map((d) => d.key);
      expect(required).toEqual(expect.arrayContaining(['size', 'color']));
    }
  });
});
