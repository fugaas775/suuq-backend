import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../src/auth/roles.guard';
import { AuditService } from '../src/audit/audit.service';
import { DataSource } from 'typeorm';

// Simple guard override that injects an admin user
const mockAdminGuard = {
  canActivate: (ctx: any) => {
    const req = ctx.switchToHttp().getRequest();
    req.user = { id: 1, email: 'admin@test.com', roles: ['SUPER_ADMIN'] };
    return true;
  },
};

describe('AdminAuditController (e2e)', () => {
  let app: INestApplication;
  let audit: AuditService;
  let dataSource: DataSource;

  const seedLogs = async () => {
    // Clear existing rows for deterministic assertions
    await dataSource.query('DELETE FROM "audit_log"');
    const base = await audit.log({
      actorId: 1,
      actorEmail: 'admin@test.com',
      action: 'vendor.verification.update',
      targetType: 'vendor',
      targetId: 101,
      meta: { status: 'APPROVED' },
    });
    const second = await audit.log({
      actorId: 2,
      actorEmail: 'user@test.com',
      action: 'vendor.active.update',
      targetType: 'vendor',
      targetId: 101,
      meta: { isActive: false },
    });
    const third = await audit.log({
      actorId: 3,
      actorEmail: 'ops@test.com',
      action: 'SIGNED_DOWNLOAD_FREE',
      targetType: 'FREE_PRODUCT_DOWNLOAD',
      targetId: 555,
      meta: { productId: 555 },
    });
    return { base, second, third };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue(mockAdminGuard)
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    audit = app.get(AuditService);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('paginates with filters and returns prettified labels', async () => {
    await seedLogs();

    const res = await request(app.getHttpServer())
      .get(
        '/api/admin/audit?page=1&limit=2&actions=vendor.verification.update&targetType=vendor',
      )
      .expect(200);

    expect(res.body.items.length).toBeGreaterThan(0);
    const item = res.body.items[0];
    expect(item.actionLabel).toBe('Approved vendor');
    expect(item.targetType).toBe('vendor');
    expect(res.body.perPage).toBe(2);
  });

  it('supports cursor pagination with filters', async () => {
    const { base, second } = await seedLogs();
    const cursor = audit.encodeCursor(second);

    const res = await request(app.getHttpServer())
      .get(`/api/admin/audit?limit=1&after=${encodeURIComponent(cursor)}`)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(1);
    expect(res.body.nextCursor === null || typeof res.body.nextCursor === 'string').toBe(true);
    expect(res.body.items[0].id).toBe(base.id);
  });
});
