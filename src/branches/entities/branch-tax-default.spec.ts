import { getMetadataArgsStorage } from 'typeorm';
import { Branch } from './branch.entity';

/**
 * A new branch starts untaxed, in every format. Pinned on the ENTITY's column
 * default (what a raw INSERT without the column gets) because that is the one
 * place a creation path that forgets the field falls back to — the admin
 * `POST /pos/v1/branches` relied on it and produced a school charging VAT.
 */
describe('branches.taxEnabled default', () => {
  it('is false on the entity column', () => {
    const column = getMetadataArgsStorage().columns.find(
      (c) => c.target === Branch && c.propertyName === 'taxEnabled',
    );
    expect(column).toBeDefined();
    expect(column?.options.default).toBe(false);
  });
});
