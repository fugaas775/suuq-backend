import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBranchWorkspaceDto } from './update-branch-workspace.dto';

async function validateDto(payload: unknown) {
  const dto = plainToInstance(UpdateBranchWorkspaceDto, payload);
  return validate(dto as object, { whitelist: true });
}

// Collect every failing property path (including nested) from a validation run,
// with array indices stripped (quickLinks.0.to -> quickLinks.to) so assertions
// don't hinge on which element failed.
function failingPaths(errors: Awaited<ReturnType<typeof validate>>): string[] {
  const out: string[] = [];
  const walk = (errs: typeof errors, prefix: string) => {
    for (const e of errs) {
      const path = prefix ? `${prefix}.${e.property}` : e.property;
      if (e.constraints) out.push(path.replace(/\.\d+(?=\.|$)/g, ''));
      if (e.children?.length) walk(e.children, path);
    }
  };
  walk(errors, '');
  return out;
}

describe('UpdateBranchWorkspaceDto — homeConfig', () => {
  const validConfig = {
    version: 1,
    widgets: [
      { id: 'kpi-band', enabled: true },
      { id: 'register', enabled: false },
    ],
    welcome: { title: 'Hello', body: 'Shift starts 8am', enabled: true },
    quickLinks: [{ id: 'q1', label: 'Reports', to: '/ops/reports' }],
    branding: { accent: '#B89130' },
  };

  it('accepts a well-formed homeConfig', async () => {
    const errors = await validateDto({ homeConfig: validConfig });
    expect(errors).toHaveLength(0);
  });

  it('accepts null (reset to per-format default)', async () => {
    const errors = await validateDto({ homeConfig: null });
    expect(errors).toHaveLength(0);
  });

  it('accepts an https:// quick-link target', async () => {
    const errors = await validateDto({
      homeConfig: {
        ...validConfig,
        quickLinks: [
          { id: 'x', label: 'Docs', to: 'https://example.com/help' },
        ],
      },
    });
    expect(errors).toHaveLength(0);
  });

  // The security-critical case: script/data URIs must never validate — they would
  // render as a user-clickable link on the Home page.
  it('rejects a javascript: quick-link target', async () => {
    const errors = await validateDto({
      homeConfig: {
        ...validConfig,
        quickLinks: [{ id: 'x', label: 'Evil', to: 'javascript:alert(1)' }],
      },
    });
    expect(failingPaths(errors)).toContain('homeConfig.quickLinks.to');
  });

  it('rejects a data: quick-link target', async () => {
    const errors = await validateDto({
      homeConfig: {
        ...validConfig,
        quickLinks: [
          {
            id: 'x',
            label: 'Evil',
            to: 'data:text/html,<script>alert(1)</script>',
          },
        ],
      },
    });
    expect(failingPaths(errors)).toContain('homeConfig.quickLinks.to');
  });

  it('rejects a plain http:// (non-https) external target', async () => {
    const errors = await validateDto({
      homeConfig: {
        ...validConfig,
        quickLinks: [{ id: 'x', label: 'Insecure', to: 'http://example.com' }],
      },
    });
    expect(failingPaths(errors)).toContain('homeConfig.quickLinks.to');
  });

  it('caps quick-links at 8', async () => {
    const quickLinks = Array.from({ length: 9 }, (_, i) => ({
      id: `q${i}`,
      label: `L${i}`,
      to: '/x',
    }));
    const errors = await validateDto({
      homeConfig: { ...validConfig, quickLinks },
    });
    expect(failingPaths(errors)).toContain('homeConfig.quickLinks');
  });

  it('rejects a non-boolean widget enabled flag', async () => {
    const errors = await validateDto({
      homeConfig: {
        ...validConfig,
        widgets: [{ id: 'kpi-band', enabled: 'yes' }],
      },
    });
    expect(failingPaths(errors)).toContain('homeConfig.widgets.enabled');
  });

  it('leaves the other branch fields independent (name still validates)', async () => {
    const errors = await validateDto({
      name: 'Blue Mall',
      homeConfig: validConfig,
    });
    expect(errors).toHaveLength(0);
  });
});
