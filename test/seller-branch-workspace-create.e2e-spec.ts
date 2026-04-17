import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { BranchStaffAssignment } from '../src/branch-staff/entities/branch-staff-assignment.entity';
import { Branch } from '../src/branches/entities/branch.entity';
import { EmailService } from '../src/email/email.service';
import { RetailTenant } from '../src/retail/entities/retail-tenant.entity';
import {
  RetailModule,
  TenantModuleEntitlement,
} from '../src/retail/entities/tenant-module-entitlement.entity';
import {
  TenantBillingInterval,
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../src/retail/entities/tenant-subscription.entity';
import { User } from '../src/users/entities/user.entity';
import { closeE2eApp } from './utils/e2e-cleanup';

describe('Seller branch workspace create (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let branchRepo: Repository<Branch>;
  let assignmentRepo: Repository<BranchStaffAssignment>;
  let retailTenantRepo: Repository<RetailTenant>;
  let subscriptionRepo: Repository<TenantSubscription>;
  let entitlementRepo: Repository<TenantModuleEntitlement>;

  let ownerUser: User;
  let retailTenant: RetailTenant;
  let existingBranch: Branch;
  let createdBranchId: number | null = null;
  let ownerToken: string;

  const ownerEmail = `seller_branch_owner_${Date.now()}@test.com`;
  const password = 'Password@123';

  const emailServiceMock = {
    send: jest.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendStaffInvitation: jest.fn().mockResolvedValue(undefined),
    sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    sendVendorNewOrderEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    initTransport: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue(emailServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    branchRepo = moduleFixture.get(getRepositoryToken(Branch));
    assignmentRepo = moduleFixture.get(
      getRepositoryToken(BranchStaffAssignment),
    );
    retailTenantRepo = moduleFixture.get(getRepositoryToken(RetailTenant));
    subscriptionRepo = moduleFixture.get(
      getRepositoryToken(TenantSubscription),
    );
    entitlementRepo = moduleFixture.get(
      getRepositoryToken(TenantModuleEntitlement),
    );

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: ownerEmail,
        password,
        displayName: 'Seller Branch Owner',
      })
      .expect(200);

    ownerUser = await userRepo.findOneOrFail({ where: { email: ownerEmail } });

    retailTenant = await retailTenantRepo.save(
      retailTenantRepo.create({
        name: `Seller Branch Tenant ${Date.now()}`,
        code: `SBT${Date.now()}`.slice(-12),
        ownerUserId: ownerUser.id,
        status: 'ACTIVE',
        defaultCurrency: 'ETB',
      }),
    );

    existingBranch = await branchRepo.save(
      branchRepo.create({
        name: 'Seller HQ',
        code: `SEL-${Date.now()}`.slice(-12),
        ownerId: ownerUser.id,
        retailTenantId: retailTenant.id,
        isActive: true,
      }),
    );

    await assignmentRepo.save(
      assignmentRepo.create({
        branchId: existingBranch.id,
        userId: ownerUser.id,
        role: 'MANAGER',
        permissions: [],
        isActive: true,
      }),
    );

    await subscriptionRepo.save(
      subscriptionRepo.create({
        tenantId: retailTenant.id,
        planCode: 'POS_BRANCH',
        status: TenantSubscriptionStatus.ACTIVE,
        billingInterval: TenantBillingInterval.MONTHLY,
        amount: 1900,
        currency: 'ETB',
        startsAt: new Date(Date.now() - 60_000),
        autoRenew: true,
      }),
    );

    await entitlementRepo.save(
      entitlementRepo.create({
        tenantId: retailTenant.id,
        module: RetailModule.POS_CORE,
        enabled: true,
      }),
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ownerEmail, password })
      .expect(200);

    ownerToken = login.body.accessToken;
  }, 120000);

  afterAll(async () => {
    try {
      if (createdBranchId) {
        await assignmentRepo.delete({ branchId: createdBranchId });
        await branchRepo.delete(createdBranchId);
      }
      if (existingBranch?.id) {
        await assignmentRepo.delete({ branchId: existingBranch.id });
        await branchRepo.delete(existingBranch.id);
      }
      if (retailTenant?.id) {
        await entitlementRepo.delete({ tenantId: retailTenant.id });
        await subscriptionRepo.delete({ tenantId: retailTenant.id });
        await retailTenantRepo.delete(retailTenant.id);
      }
      if (ownerUser?.id) {
        await userRepo.delete(ownerUser.id);
      }
    } catch {
      // ignore cleanup failures
    } finally {
      await closeE2eApp({ app });
    }
  });

  it('creates another branch workspace and exposes it through both seller HQ and the POS session', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/seller/v1/workspace/branch-workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        branchName: 'Megenagna Annex',
        city: 'Addis Ababa',
        country: 'Ethiopia',
        address: 'Megenagna Square',
        serviceFormat: 'CAFETERIA',
        defaultCurrency: 'ETB',
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      branchName: 'Megenagna Annex',
      serviceFormat: 'CAFETERIA',
      retailTenantId: retailTenant.id,
      workspaceStatus: 'ACTIVE',
      canOpenNow: true,
      subscriptionStatus: 'ACTIVE',
    });
    createdBranchId = createResponse.body.branchId;

    await request(app.getHttpServer())
      .get('/seller/v1/workspace/branch-workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              branchId: createdBranchId,
              branchName: 'Megenagna Annex',
              serviceFormat: 'CAFETERIA',
              retailTenantId: retailTenant.id,
              canOpenNow: true,
            }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .get('/pos-portal/auth/session')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body.branches).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              branchId: createdBranchId,
              branchName: 'Megenagna Annex',
              serviceFormat: 'CAFETERIA',
              retailTenantId: retailTenant.id,
              canOpenNow: true,
              workspaceStatus: 'ACTIVE',
            }),
          ]),
        );
      });
  });
});
