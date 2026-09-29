import {
  SchoolStatementCodeService,
  mintStatementCode,
} from './school-statement-code.service';
import { memRepo } from './test/memory-repo';

/* One token per pupil, minted once and kept for good. */

describe('SchoolStatementCodeService', () => {
  it('mints a Crockford token in the receipt alphabet', () => {
    for (let i = 0; i < 50; i += 1)
      expect(mintStatementCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{14}$/);
    expect(
      new Set(Array.from({ length: 20 }, () => mintStatementCode())).size,
    ).toBe(20);
  });

  it('hands the same code back on every read, one per pupil', async () => {
    const rows: any[] = [];
    const svc = new SchoolStatementCodeService(memRepo(rows));
    const a = await svc.codeFor(128, 10);
    expect(a.displayCode).toBe(a.code.match(/.{1,4}/g).join('-'));
    expect(await svc.codeFor(128, 10)).toEqual(a);
    const b = await svc.codeFor(128, 11);
    expect(b.code).not.toBe(a.code);
    expect(rows).toHaveLength(2);
  });
});
