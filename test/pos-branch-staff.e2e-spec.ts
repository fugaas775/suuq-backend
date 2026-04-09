import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { User } from '../src/users/entities/user.entity';
import { Branch } from '../src/branches/entities/branch.entity';
import { BranchStaffInvite } from '../src/branch-staff/entities/branch-staff-invite.entity';
import { BranchStaffAssignment } from '../src/branch-staff/entities/branch-staff-assignment.entity';
import {
  RetailModule,
  TenantModuleEntitlement,
} from '../src/retail/entities/tenant-module-entitlement.entity';
import {
  RetailTenant,
  RetailTenantStatus,
} from '../src/retail/entities/retail-tenant.entity';
import {
  TenantBillingInterval,
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../src/retail/entities/tenant-subscription.entity';
import { EmailService } from '../src/email/email.service';
import { closeE2eApp } from './utils/e2e-cleanup';

describe('POS Branch Staff Onboarding (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let userRepo: Repository<User>;
  let branchRepo: Repository<Branch>;
  let inviteRepo: Repository<BranchStaffInvite>;
  let assignmentRepo: Repository<BranchStaffAssignment>;
  let retailTenantRepo: Repository<RetailTenant>;
  let subscriptionRepo: Repository<TenantSubscription>;
  let entitlementRepo: Repository<TenantModuleEntitlement>;

  let ownerUser: User;
  let managerUser: User;
  let branch: Branch;
  let retailTenant: RetailTenant;
  let ownerToken: string;
  let managerPreAssignmentToken: string;
  let pendingInviteId: number;
  let revokedInviteId: number;

  const ownerEmail = `pos_owner_${Date.now()}@test.com`;
  const managerEmail = `pos_manager_${Date.now()}@test.com`;
  const invitedEmail = `pos_invited_${Date.now()}@test.com`;
  const revokedEmail = `pos_revoked_${Date.now()}@test.com`;
  const managerInviteEmail = `pos_manager_invited_${Date.now()}@test.com`;
  const selfServeEmail = `pos_self_serve_${Date.now()}@test.com`;
  const selfServeDeniedEmail = `pos_self_serve_denied_${Date.now()}@test.com`;
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

    authService = moduleFixture.get(AuthService);
    userRepo = moduleFixture.get(getRepositoryToken(User));
    branchRepo = moduleFixture.get(getRepositoryToken(Branch));
    inviteRepo = moduleFixture.get(getRepositoryToken(BranchStaffInvite));
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
        displayName: 'POS Owner',
      })
      .expect(200);

    ownerUser = await userRepo.findOneOrFail({ where: { email: ownerEmail } });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: managerEmail,
        password,
        displayName: 'Branch Manager',
      })
      .expect(200);

    managerUser = await userRepo.findOneOrFail({
      where: { email: managerEmail },
    });

    const preAssignmentLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: managerEmail, password })
      .expect(200);

    managerPreAssignmentToken = preAssignmentLogin.body.accessToken;

    retailTenant = await retailTenantRepo.save(
      retailTenantRepo.create({
        name: `POS Tenant ${Date.now()}`,
        code: `POS${Date.now()}`.slice(-12),
        ownerUserId: ownerUser.id,
        status: RetailTenantStatus.ACTIVE,
      }),
    );

    branch = await branchRepo.save(
      branchRepo.create({
        name: 'POS Main Branch',
        code: `POS-${Date.now()}`.slice(-12),
        ownerId: ownerUser.id,
        retailTenantId: retailTenant.id,
        isActive: true,
      }),
    );

    await subscriptionRepo.save(
      subscriptionRepo.create({
        tenantId: retailTenant.id,
        planCode: 'POS_TEST',
        status: TenantSubscriptionStatus.ACTIVE,
        billingInterval: TenantBillingInterval.MONTHLY,
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

    Object.defineProperty(authService as any, 'oauthClient', {
      value: {
        verifyIdToken: jest.fn(async () => ({
          getPayload: () => ({
            email: invitedEmail,
            name: 'Invited POS User',
            picture: 'https://example.com/avatar.png',
            sub: `google-${Date.now()}`,
          }),
        })),
      },
      configurable: true,
    });
  }, 120000);

  afterAll(async () => {
    try {
      await inviteRepo.delete({ branchId: branch?.id });
      await assignmentRepo.delete({ branchId: branch?.id });
      if (branch?.id) await branchRepo.delete(branch.id);
      if (retailTenant?.id) {
        await entitlementRepo.delete({ tenantId: retailTenant.id });
        await subscriptionRepo.delete({ tenantId: retailTenant.id });
        await retailTenantRepo.delete(retailTenant.id);
      }
      const manager = await userRepo.findOne({
        where: { email: managerEmail },
      });
      const invitedUser = await userRepo.findOne({
        where: { email: invitedEmail },
      });
      const revokedUser = await userRepo.findOne({
        where: { email: revokedEmail },
      });
      const selfServeUser = await userRepo.findOne({
        where: { email: selfServeEmail },
      });
      const selfServeDeniedUser = await userRepo.findOne({
        where: { email: selfServeDeniedEmail },
      });
      if (manager) await userRepo.delete(manager.id);
      if (invitedUser) await userRepo.delete(invitedUser.id);
      if (revokedUser) await userRepo.delete(revokedUser.id);
      if (selfServeUser) {
        const selfServeTenant = await retailTenantRepo.findOne({
          where: { ownerUserId: selfServeUser.id },
        });
        if (selfServeTenant) {
          await entitlementRepo.delete({ tenantId: selfServeTenant.id });
          await subscriptionRepo.delete({ tenantId: selfServeTenant.id });
          await branchRepo.delete({ retailTenantId: selfServeTenant.id });
          await retailTenantRepo.delete(selfServeTenant.id);
        }
        await assignmentRepo.delete({ userId: selfServeUser.id });
        await userRepo.delete(selfServeUser.id);
      }
      if (selfServeDeniedUser) {
        const selfServeDeniedTenant = await retailTenantRepo.findOne({
          where: { ownerUserId: selfServeDeniedUser.id },
        });
        if (selfServeDeniedTenant) {
          await entitlementRepo.delete({ tenantId: selfServeDeniedTenant.id });
          await subscriptionRepo.delete({ tenantId: selfServeDeniedTenant.id });
          await branchRepo.delete({ retailTenantId: selfServeDeniedTenant.id });
          await retailTenantRepo.delete(selfServeDeniedTenant.id);
        }
        await assignmentRepo.delete({ userId: selfServeDeniedUser.id });
        await userRepo.delete(selfServeDeniedUser.id);
      }
      if (ownerUser) await userRepo.delete(ownerUser.id);
    } catch {
      // ignore cleanup failures
    } finally {
      await closeE2eApp({ app });
    }
  });

  it('creates, lists, and resends a pending invite', async () => {
    const invite = await request(app.getHttpServer())
      .post(`/pos/v1/branches/${branch.id}/staff/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: invitedEmail,
        role: 'OPERATOR',
        permissions: ['OPEN_REGISTER'],
      })
      .expect(201);

    expect(invite.body.status).toBe('PENDING_SIGNUP');
    expect(invite.body.invite.email).toBe(invitedEmail);
    pendingInviteId = invite.body.invite.id;

    await request(app.getHttpServer())
      .get(`/pos/v1/branches/${branch.id}/staff/invites`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: pendingInviteId,
              email: invitedEmail,
              isActive: true,
            }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .post(
        `/pos/v1/branches/${branch.id}/staff/invites/${pendingInviteId}/resend`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201)
      .expect((res: any) => {
        expect(res.body.status).toBe('RESENT');
        expect(res.body.invite.id).toBe(pendingInviteId);
      });
  });

  it('allows a branch manager to manage invites even with a token issued before the manager assignment existed', async () => {
    await request(app.getHttpServer())
      .post(`/pos/v1/branches/${branch.id}/staff`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        userId: managerUser.id,
        role: 'MANAGER',
        permissions: ['OPEN_REGISTER'],
      })
      .expect(201);

    const invite = await request(app.getHttpServer())
      .post(`/pos/v1/branches/${branch.id}/staff/invite`)
      .set('Authorization', `Bearer ${managerPreAssignmentToken}`)
      .send({
        email: managerInviteEmail,
        role: 'OPERATOR',
        permissions: ['OPEN_REGISTER'],
      })
      .expect(201);

    expect(invite.body.status).toBe('PENDING_SIGNUP');
    expect(invite.body.invite.email).toBe(managerInviteEmail);

    await request(app.getHttpServer())
      .get(`/pos/v1/branches/${branch.id}/staff/invites`)
      .set('Authorization', `Bearer ${managerPreAssignmentToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              email: managerInviteEmail,
              role: 'OPERATOR',
              permissions: ['OPEN_REGISTER'],
            }),
          ]),
        );
      });
  });

  it('auto-claims a pending invite on first Google sign-in and resolves a POS session', async () => {
    const googleLogin = await request(app.getHttpServer())
      .post('/pos-portal/auth/google')
      .send({ idToken: 'google-token' })
      .expect(200);

    expect(googleLogin.body.user.email).toBe(invitedEmail);
    expect(Array.isArray(googleLogin.body.branches)).toBe(true);
    expect(googleLogin.body.branches).toHaveLength(1);
    expect(googleLogin.body.branches[0].branchId).toBe(branch.id);
    expect(googleLogin.body.defaultBranchId).toBe(branch.id);
    expect(googleLogin.body.user.roles).toContain('POS_OPERATOR');

    await request(app.getHttpServer())
      .get('/pos-portal/auth/session')
      .set('Authorization', `Bearer ${googleLogin.body.accessToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body.user.email).toBe(invitedEmail);
        expect(res.body.branches).toHaveLength(1);
        expect(res.body.branches[0].branchId).toBe(branch.id);
      });

    const storedInvite = await inviteRepo.findOneOrFail({
      where: { id: pendingInviteId },
    });
    expect(storedInvite.isActive).toBe(false);
    expect(storedInvite.acceptedByUserId).toBeTruthy();

    const assignment = await assignmentRepo.findOneOrFail({
      where: { branchId: branch.id, userId: storedInvite.acceptedByUserId },
    });
    expect(assignment.role).toBe('OPERATOR');
  });

  it('revokes a pending invite and removes it from the pending list', async () => {
    const invite = await request(app.getHttpServer())
      .post(`/pos/v1/branches/${branch.id}/staff/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: revokedEmail,
        role: 'OPERATOR',
        permissions: ['OPEN_REGISTER'],
      })
      .expect(201);

    revokedInviteId = invite.body.invite.id;

    await request(app.getHttpServer())
      .post(
        `/pos/v1/branches/${branch.id}/staff/invites/${revokedInviteId}/revoke`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201)
      .expect((res: any) => {
        expect(res.body.status).toBe('REVOKED');
        expect(res.body.invite.id).toBe(revokedInviteId);
        expect(res.body.invite.isActive).toBe(false);
      });

    await request(app.getHttpServer())
      .get(`/pos/v1/branches/${branch.id}/staff/invites`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(
          res.body.find((entry: any) => entry.id === revokedInviteId),
        ).toBeUndefined();
      });
  });

  it('unassigns an active branch staff member through the delete route and removes them from the active roster', async () => {
    await request(app.getHttpServer())
      .post(`/pos/v1/branches/${branch.id}/staff`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        userId: managerUser.id,
        role: 'OPERATOR',
        permissions: ['OPEN_REGISTER'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/pos/v1/branches/${branch.id}/staff`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              userId: managerUser.id,
              isActive: true,
            }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .delete(`/pos/v1/branches/${branch.id}/staff/${managerUser.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body.userId).toBe(managerUser.id);
        expect(res.body.isActive).toBe(false);
      });

    await request(app.getHttpServer())
      .get(`/pos/v1/branches/${branch.id}/staff`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(
          res.body.find((entry: any) => entry.userId === managerUser.id),
        ).toBeUndefined();
      });
  });

  it('creates a first self-serve workspace and persists branch access entitlements', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: selfServeEmail,
        password,
        displayName: 'Self Serve Owner',
      })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: selfServeEmail, password })
      .expect(200);

    const workspaceResponse = await request(app.getHttpServer())
      .post('/pos-portal/auth/workspace')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({
        businessName: 'Self Serve Retail',
        branchName: 'Self Serve Main',
        defaultCurrency: 'ETB',
        city: 'Addis Ababa',
        country: 'Ethiopia',
        address: 'Bole Road',
      })
      .expect(201);

    expect(workspaceResponse.body.onboardingState).toBe(
      'BRANCH_WORKSPACE_ACTIVATION_REQUIRED',
    );
    expect(workspaceResponse.body.workspace.tenantName).toBe(
      'Self Serve Retail',
    );
    expect(workspaceResponse.body.workspace.branchName).toBe('Self Serve Main');
    expect(workspaceResponse.body.workspace.workspaceStatus).toBe(
      'PAYMENT_REQUIRED',
    );
    expect(Array.isArray(workspaceResponse.body.activationCandidates)).toBe(
      true,
    );
    expect(workspaceResponse.body.activationCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchName: 'Self Serve Main',
          workspaceStatus: 'PAYMENT_REQUIRED',
          retailTenantName: 'Self Serve Retail',
        }),
      ]),
    );

    const selfServeUser = await userRepo.findOneOrFail({
      where: { email: selfServeEmail },
    });
    const createdTenant = await retailTenantRepo.findOneOrFail({
      where: { ownerUserId: selfServeUser.id },
      relations: { branches: true, entitlements: true },
    });

    expect(createdTenant.name).toBe('Self Serve Retail');
    expect(createdTenant.billingEmail).toBe(selfServeEmail);
    expect(createdTenant.branches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Self Serve Main',
          retailTenantId: createdTenant.id,
          city: 'Addis Ababa',
          country: 'Ethiopia',
        }),
      ]),
    );

    const createdBranch = createdTenant.branches?.[0];
    expect(createdBranch).toBeTruthy();

    const assignment = await assignmentRepo.findOneOrFail({
      where: { userId: selfServeUser.id, branchId: createdBranch.id },
    });
    expect(assignment.role).toBe('MANAGER');
    expect(assignment.isActive).toBe(true);

    const entitlements = await entitlementRepo.find({
      where: { tenantId: createdTenant.id },
    });
    expect(entitlements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: RetailModule.POS_CORE,
          enabled: true,
          reason: 'Enabled during POS-S self-serve onboarding',
        }),
        expect.objectContaining({
          module: RetailModule.INVENTORY_CORE,
          enabled: true,
          reason: 'Enabled during POS-S self-serve onboarding',
        }),
      ]),
    );
  });

  it('allows an existing branchless account to enter self-serve onboarding after POS portal access is denied', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: selfServeDeniedEmail,
        password,
        displayName: 'Denied Self Serve Owner',
      })
      .expect(200);

    const deniedLogin = await request(app.getHttpServer())
      .post('/pos-portal/auth/login')
      .send({ email: selfServeDeniedEmail, password })
      .expect(403);

    expect(deniedLogin.body.code).toBe('POS_PORTAL_ACCESS_DENIED');
    expect(typeof deniedLogin.body.onboardingAccessToken).toBe('string');
    expect(deniedLogin.body.onboardingAccessToken.length).toBeGreaterThan(10);

    const workspaceResponse = await request(app.getHttpServer())
      .post('/pos-portal/auth/workspace')
      .set('Authorization', `Bearer ${deniedLogin.body.onboardingAccessToken}`)
      .send({
        businessName: 'Denied Self Serve Retail',
        branchName: 'Denied Self Serve Main',
        defaultCurrency: 'ETB',
        city: 'Addis Ababa',
        country: 'Ethiopia',
        address: 'Bole Road',
      })
      .expect(201);

    expect(workspaceResponse.body.onboardingState).toBe(
      'BRANCH_WORKSPACE_ACTIVATION_REQUIRED',
    );
    expect(workspaceResponse.body.workspace).toEqual(
      expect.objectContaining({
        tenantName: 'Denied Self Serve Retail',
        branchName: 'Denied Self Serve Main',
        workspaceStatus: 'PAYMENT_REQUIRED',
      }),
    );
  });
});
