import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every table this module's raw SQL names must actually exist.
 *
 * `resolveFeeLines` shipped querying `"products"`. The entity is `@Entity()`
 * with no argument, so TypeORM names the table after the lowercased class —
 * `product`, singular — and raw SQL gets none of that mapping. It typechecked,
 * it passed every mocked unit test, and it failed the first time it touched a
 * real database.
 *
 * The local stub table did not catch it either, because the stub was named
 * after the same wrong assumption the query made. A fixture you wrote agrees
 * with you by construction; only the real schema disagrees.
 *
 * So this asserts against the ENTITY DEFINITIONS rather than against a fixture:
 * the set of tables the codebase actually declares. A guessed name fails here
 * instead of in production.
 */

const ENTITY_GLOB_ROOT = join(__dirname, '..');

/** Table names declared by @Entity('x'), plus the lowercased-class default. */
function declaredTableNames(): Set<string> {
  const { execSync } = require('child_process');
  const files: string[] = execSync(
    `find ${ENTITY_GLOB_ROOT} -name '*.entity.ts'`,
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);

  const names = new Set<string>();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const explicit = src.matchAll(/@Entity\(\s*['"]([a-zA-Z0-9_]+)['"]/g);
    let sawExplicit = false;
    for (const m of explicit) {
      names.add(m[1].toLowerCase());
      sawExplicit = true;
    }
    if (!sawExplicit && /@Entity\(\s*\)/.test(src)) {
      // TypeORM's default: the class name, lowercased.
      const cls = src.match(/export class (\w+)/);
      if (cls) names.add(cls[1].toLowerCase());
    }
  }
  return names;
}

/**
 * Table names the module's raw SQL reads from or joins.
 *
 * Scans EVERY file in the module, not just the one where the bug happened. A
 * guard aimed at a single file stops guarding the moment somebody adds raw SQL
 * next door — which is exactly what the public verification service then did.
 */
function tablesReferencedInRawSql(): string[] {
  const { execSync } = require('child_process');
  const files: string[] = execSync(`find ${__dirname} -name '*.ts' -not -name '*.spec.ts'`, {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const src = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  const refs = new Set<string>();
  for (const m of src.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+"([a-zA-Z0-9_]+)"/g)) {
    refs.add(m[1].toLowerCase());
  }
  return [...refs].sort();
}

describe('vehicle-registry raw SQL', () => {
  it('names only tables the codebase actually declares', () => {
    const declared = declaredTableNames();
    const referenced = tablesReferencedInRawSql();

    expect(referenced.length).toBeGreaterThan(0);

    const unknown = referenced.filter((t) => !declared.has(t));
    expect(unknown).toEqual([]);
  });

  it('reads the product catalogue as "product", not "products"', () => {
    // The specific mistake, pinned. Worth its own case because the generic
    // check above would go quiet the day somebody adds a Products entity.
    const referenced = tablesReferencedInRawSql();
    expect(referenced).toContain('product');
    expect(referenced).not.toContain('products');
  });
});
