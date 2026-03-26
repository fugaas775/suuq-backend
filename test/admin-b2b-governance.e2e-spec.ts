import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../src/auth/roles.guard';
import { AuditService } from '../src/audit/audit.service';
import { AdminB2bController } from '../src/admin/b2b.admin.controller';
import { AdminB2bService } from '../src/admin/b2b.admin.service';
import { PartnerCredentialsService } from '../src/partner-credentials/partner-credentials.service';
import { PurchaseOrdersService } from '../src/purchase-orders/purchase-orders.service';
import { SuppliersService } from '../src/suppliers/suppliers.service';

describe('AdminB2bController supplier governance (e2e)', () => {
  let app: INestApplication;
  let suppliersService: {
    findReviewQueue: jest.Mock;
    updateStatus: jest.Mock;
  };
  let partnerCredentialsService: {
    revoke: jest.Mock;
    rotateBranchAssignment: jest.Mock;
  };

  beforeAll(async () => {
    suppliersService = {
      findReviewQueue: jest.fn().mockResolvedValue([
        {
          id: 5,
          companyName: 'Acme Supply',
          status: 'PENDING_REVIEW',
        },
      ]),
      updateStatus: jest.fn().mockResolvedValue({
        id: 5,
        companyName: 'Acme Supply',
        status: 'APPROVED',
      }),
    };

    partnerCredentialsService = {
      revoke: jest.fn().mockResolvedValue({ id: 13, status: 'REVOKED' }),
      rotateBranchAssignment: jest
        .fn()
        .mockResolvedValue({ id: 13, branchId: 4, status: 'ACTIVE' }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminB2bController],
      providers: [
        {
          provide: AdminB2bService,
          useValue: {},
        },
        {
          provide: SuppliersService,
          useValue: suppliersService,
        },
        {
          provide: PartnerCredentialsService,
          useValue: partnerCredentialsService,
        },
        {
          provide: PurchaseOrdersService,
          useValue: {},
        },
        {
          provide: AuditService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 7, email: 'admin@test.com', roles: ['ADMIN'] };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists the supplier review queue and defaults to pending review', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/supplier-profiles/review-queue')
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({ id: 5, status: 'PENDING_REVIEW' }),
    ]);
    expect(suppliersService.findReviewQueue).toHaveBeenCalledWith(
      'PENDING_REVIEW',
    );
  });

  it('lists the supplier review queue for an explicit status', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/b2b/supplier-profiles/review-queue')
      .query({ status: 'APPROVED' })
      .expect(200);

    expect(suppliersService.findReviewQueue).toHaveBeenCalledWith('APPROVED');
  });

  it('approves a supplier profile with actor metadata', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/admin/b2b/supplier-profiles/5/approve')
      .send({ reason: 'Verified documents and settlement details' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({ id: 5, companyName: 'Acme Supply' }),
    );
    expect(suppliersService.updateStatus).toHaveBeenCalledWith(
      5,
      { status: 'APPROVED' },
      {
        id: 7,
        email: 'admin@test.com',
        roles: ['ADMIN'],
        reason: 'Verified documents and settlement details',
      },
    );
  });

  it('rejects a supplier profile with actor metadata', async () => {
    await request(app.getHttpServer())
      .patch('/api/admin/b2b/supplier-profiles/5/reject')
      .send({ reason: 'Banking documentation incomplete' })
      .expect(200);

    expect(suppliersService.updateStatus).toHaveBeenCalledWith(
      5,
      { status: 'REJECTED' },
      {
        id: 7,
        email: 'admin@test.com',
        roles: ['ADMIN'],
        reason: 'Banking documentation incomplete',
      },
    );
  });

  it('revokes a partner credential with actor metadata', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/admin/b2b/partner-credentials/13/revoke')
      .send({ reason: 'Terminal retired after vendor migration' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({ id: 13, status: 'REVOKED' }),
    );
    expect(partnerCredentialsService.revoke).toHaveBeenCalledWith(13, {
      id: 7,
      email: 'admin@test.com',
      reason: 'Terminal retired after vendor migration',
    });
  });

  it('rotates a partner credential branch assignment with actor metadata', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/admin/b2b/partner-credentials/13/branch-assignment')
      .send({ branchId: 4, reason: 'Terminal moved to kiosk branch' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({ id: 13, branchId: 4 }),
    );
    expect(
      partnerCredentialsService.rotateBranchAssignment,
    ).toHaveBeenCalledWith(13, 4, {
      id: 7,
      email: 'admin@test.com',
      reason: 'Terminal moved to kiosk branch',
    });
  });

  it('rejects malformed supplier review and partner credential payloads', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/b2b/supplier-profiles/review-queue?status=NOT_REAL')
      .expect(400);

    await request(app.getHttpServer())
      .patch('/api/admin/b2b/supplier-profiles/5/approve')
      .send({ reason: 'x'.repeat(501) })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/api/admin/b2b/partner-credentials/13/revoke')
      .send({ reason: 'x'.repeat(501) })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/api/admin/b2b/partner-credentials/13/branch-assignment')
      .send({ branchId: 'not-a-number' })
      .expect(400);
  });
});
