import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request from 'supertest';
import { RolesGuard } from '../src/auth/roles.guard';
import { AuditService } from '../src/audit/audit.service';
import { UsersService } from '../src/users/users.service';
import { VendorService } from '../src/vendor/vendor.service';
import { AdminVendorsController } from '../src/admin/vendors.admin.controller';

describe('AdminVendorsController query contracts (e2e)', () => {
  let app: INestApplication;
  let vendorService: {
    findPublicVendors: jest.Mock;
    getAdminVendorDetail: jest.Mock;
    setVendorVerificationStatus: jest.Mock;
    setVendorActiveState: jest.Mock;
  };
  let usersService: {
    confirmTelebirrAccount: jest.Mock;
  };
  let auditService: {
    listForTargetPaged: jest.Mock;
    listForTargetCursor: jest.Mock;
    log: jest.Mock;
  };

  beforeAll(async () => {
    vendorService = {
      findPublicVendors: jest.fn().mockResolvedValue({
        items: [{ id: 7, displayName: 'Acme Supply' }],
        total: 1,
        currentPage: 2,
        totalPages: 1,
      }),
      getAdminVendorDetail: jest.fn().mockResolvedValue({ id: 7 }),
      setVendorVerificationStatus: jest.fn().mockResolvedValue({
        verificationStatus: 'APPROVED',
      }),
      setVendorActiveState: jest.fn().mockResolvedValue({
        isActive: false,
      }),
    };

    usersService = {
      confirmTelebirrAccount: jest.fn().mockResolvedValue({
        telebirrVerified: true,
        telebirrAccount: '24800123',
      }),
    };

    auditService = {
      listForTargetPaged: jest.fn().mockResolvedValue({
        items: [
          {
            id: 8,
            action: 'vendor.active.update',
            actorId: 9,
            actorEmail: 'admin@example.com',
            meta: { isActive: false },
            createdAt: '2026-03-20T10:05:00.000Z',
          },
        ],
        total: 1,
        page: 2,
        perPage: 10,
        totalPages: 1,
      }),
      listForTargetCursor: jest.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
      }),
      log: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminVendorsController],
      providers: [
        { provide: VendorService, useValue: vendorService },
        { provide: UsersService, useValue: usersService },
        { provide: AuditService, useValue: auditService },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          const role = req.headers['x-test-role'];
          req.user = {
            id: role === 'SUPER_ADMIN' ? 11 : 9,
            email:
              role === 'SUPER_ADMIN'
                ? 'super@example.com'
                : 'admin@example.com',
            roles: role === 'SUPER_ADMIN' ? ['SUPER_ADMIN'] : ['ADMIN'],
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists vendors with validated filters and meta payloads', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/vendors')
      .query({
        page: '2',
        limit: '50',
        vendorId: '7',
        sort: 'verifiedAt',
        verificationStatus: 'APPROVED',
        certificationStatus: 'certified',
        subscriptionTier: 'pro',
        minSales: '100',
        minRating: '4.5',
        meta: '1',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        data: [expect.objectContaining({ id: 7 })],
        meta: expect.objectContaining({ page: 2, perPage: 50 }),
      }),
    );
    expect(vendorService.findPublicVendors).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 50,
        search: '7',
        sort: 'verifiedAt',
        verificationStatus: 'APPROVED',
        certificationStatus: 'certified',
        subscriptionTier: 'pro',
        minSales: 100,
        minRating: 4.5,
      }),
    );
  });

  it('searches vendors with validated autocomplete filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/vendors/search')
      .query({ q: '  acme  ', certificationStatus: 'certified', limit: '25' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        items: [expect.objectContaining({ id: 7 })],
        page: 2,
      }),
    );
    expect(vendorService.findPublicVendors).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 25,
        search: 'acme',
        certificationStatus: 'certified',
      }),
    );
  });

  it('lists vendor audit history with validated paged filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/vendors/12/audit')
      .query({
        page: '2',
        limit: '10',
        actions: 'vendor.active.update',
        actorEmail: 'admin@example.com',
        actorId: '9',
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-20T23:59:59.999Z',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        items: [expect.objectContaining({ actionLabel: 'Deactivated vendor' })],
        total: 1,
        page: 2,
      }),
    );
    expect(auditService.listForTargetPaged).toHaveBeenCalledWith('vendor', 12, {
      page: 2,
      limit: 10,
      filters: expect.objectContaining({
        actions: ['vendor.active.update'],
        actorEmail: 'admin@example.com',
        actorId: 9,
      }),
    });
  });

  it('rejects malformed admin vendor query filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/vendors?limit=500')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/vendors/search?limit=0')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/vendors/12/audit?actorId=abc')
      .expect(400);
  });

  it('confirms telebirr status and writes vendor audit metadata', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/vendors/7/confirm-telebirr')
      .send({ status: 'APPROVED' })
      .expect(201);

    expect(response.body).toEqual({ ok: true, telebirrVerified: true });
    expect(usersService.confirmTelebirrAccount).toHaveBeenCalledWith(
      7,
      'APPROVED',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'vendor.telebirr.verification',
        targetId: 7,
        actorId: 9,
      }),
    );
  });

  it('rejects malformed telebirr confirmation status', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/vendors/7/confirm-telebirr')
      .send({ status: 'PENDING' })
      .expect(400);
  });

  it('updates vendor verification with actor audit context', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/admin/vendors/7/verification')
      .send({ status: 'APPROVED', reason: 'Manual review complete' })
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      vendorId: 7,
      status: 'APPROVED',
    });
    expect(vendorService.setVendorVerificationStatus).toHaveBeenCalledWith(
      7,
      'APPROVED',
      'Manual review complete',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'vendor.verification.update',
        targetId: 7,
        actorId: 9,
      }),
    );
  });

  it('rejects malformed verification payloads', async () => {
    await request(app.getHttpServer())
      .patch('/api/admin/vendors/7/verification')
      .send({ status: 'NOT_REAL' })
      .expect(400);
  });

  it('forbids active-state changes for non-super-admin users', async () => {
    await request(app.getHttpServer())
      .patch('/api/admin/vendors/7/active')
      .send({ isActive: false })
      .expect(403);
  });

  it('updates active state for super admins and writes an audit record', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/admin/vendors/7/active')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ isActive: false })
      .expect(200);

    expect(response.body).toEqual({ ok: true, vendorId: 7, isActive: false });
    expect(vendorService.setVendorActiveState).toHaveBeenCalledWith(7, false);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'vendor.active.update',
        targetId: 7,
        actorId: 11,
        actorEmail: 'super@example.com',
      }),
    );
  });

  it('rejects malformed active-state payloads', async () => {
    await request(app.getHttpServer())
      .patch('/api/admin/vendors/7/active')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ isActive: 'false' })
      .expect(400);
  });
});
