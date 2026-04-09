import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
const request = require('supertest');
import { AppModule } from '../src/app.module'; // Adjust path if needed
import { UserRole } from '../src/auth/roles.enum';
import { VendorPermission } from '../src/vendor/vendor-permissions.enum';
import { Repository } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VendorStaffService } from '../src/vendor/vendor-staff.service';
import { EmailService } from '../src/email/email.service';
import { closeE2eApp } from './utils/e2e-cleanup';

describe('Vendor Staff Integration (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;

  let vendorToken: string;
  let vendorUser: User;

  let staffToken: string;
  let staffUser: User;
  let staffRecordId: number;

  let customerToken: string;
  let customerUser: User;

  const vendorEmail = `vendor_${Date.now()}@test.com`;
  const staffEmail = `staff_${Date.now()}@test.com`;
  const customerEmail = `customer_${Date.now()}@test.com`;
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

    userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));

    // 1. Create Vendor User
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: vendorEmail,
        password: password,
        roles: [UserRole.VENDOR],
      })
      .expect(200);

    // Login to get token
    const vendorLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: vendorEmail, password: password })
      .expect(200);

    vendorToken = vendorLogin.body.accessToken;
    vendorUser = await userRepo.findOne({ where: { email: vendorEmail } });

    if (!vendorUser.roles.includes(UserRole.VENDOR)) {
      vendorUser.roles = [...vendorUser.roles, UserRole.VENDOR];
      await userRepo.save(vendorUser);

      const vendorStaffService = moduleFixture.get(VendorStaffService);
      await vendorStaffService.bootstrapOwner(vendorUser);
    }

    // 2. Create Staff User
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: staffEmail,
        password: password,
      })
      .expect(200);

    const staffLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: staffEmail, password: password })
      .expect(200);

    staffToken = staffLogin.body.accessToken;
    staffUser = await userRepo.findOne({ where: { email: staffEmail } });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: customerEmail,
        password: password,
      })
      .expect(200);

    const customerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: customerEmail, password: password })
      .expect(200);

    customerToken = customerLogin.body.accessToken;
    customerUser = await userRepo.findOne({ where: { email: customerEmail } });
  }, 120000);

  afterAll(async () => {
    try {
      if (vendorUser) await userRepo.delete(vendorUser.id);
      if (staffUser) await userRepo.delete(staffUser.id);
      if (customerUser) await userRepo.delete(customerUser.id);
    } catch {
      /* ignore */
    } finally {
      try {
        await closeE2eApp({ app });
      } catch {
        /* ignore */
      }
    }
  });

  it('/vendor/staff (POST) - Invite Staff Member', async () => {
    const res = await request(app.getHttpServer())
      .post('/vendor/staff')
      .set('Authorization', `Bearer ${vendorToken}`)
      .set('x-vendor-id', String(vendorUser.id))
      .send({
        email: staffEmail,
        permissions: [
          VendorPermission.MANAGE_PRODUCTS,
          VendorPermission.VIEW_ORDERS,
        ],
      })
      .expect(201);

    staffRecordId = res.body.id;
    expect(res.body.member.id).toBe(staffUser.id);
  });

  it('/vendor/staff (POST) - Re-Invite Staff Member (Idempotency/Update)', async () => {
    // Re-invite the same staff with different permissions
    const res = await request(app.getHttpServer())
      .post('/vendor/staff')
      .set('Authorization', `Bearer ${vendorToken}`)
      .set('x-vendor-id', String(vendorUser.id))
      .send({
        email: staffEmail,
        permissions: [VendorPermission.MANAGE_PRODUCTS], // Reduced permissions
      })
      .expect(201); // Should still succeed (was 409 Conflict before)

    expect(res.body.id).toBe(staffRecordId); // Same record ID
    expect(res.body.permissions).toEqual([VendorPermission.MANAGE_PRODUCTS]);
  });

  it('/vendor/staff (GET) - List Staff', () => {
    return request(app.getHttpServer())
      .get('/vendor/staff')
      .set('Authorization', `Bearer ${vendorToken}`)
      .set('x-vendor-id', String(vendorUser.id))
      .expect(200)
      .expect((res: any) => {
        const memberIds = res.body.map((s: any) => s.member.id);
        expect(memberIds).toContain(vendorUser.id);
        expect(memberIds).toContain(staffUser.id);
      });
  });

  it('/vendor/me/stores (GET) - List My Stores (Store Switcher)', async () => {
    // 1. Check Staff User (should see the vendor's store)
    await request(app.getHttpServer())
      .get('/vendor/me/stores')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200)
      .expect((res: any) => {
        // Should return an array
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        const store = res.body.find((s: any) => s.vendorId === vendorUser.id);
        expect(store).toBeDefined();
        expect(store.permissions).toBeDefined();
        expect(store.title).toBe('Staff');
        expect(store.storeName).toBeDefined();
        expect(typeof store.storeName).toBe('string');
      });

    // 2. Check Vendor User (should see their own store)
    await request(app.getHttpServer())
      .get('/vendor/me/stores')
      .set('Authorization', `Bearer ${vendorToken}`)
      .expect(200)
      .expect((res: any) => {
        const store = res.body.find((s: any) => s.vendorId === vendorUser.id);
        expect(store).toBeDefined();
        expect(store.title).toBe('Owner');
        expect(store.storeName).toBeDefined();
      });
  });

  it('/vendor-portal/auth/session (GET) - Returns vendor portal session payload', async () => {
    await request(app.getHttpServer())
      .get('/vendor-portal/auth/session')
      .set('Authorization', `Bearer ${vendorToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body.user).toBeDefined();
        expect(res.body.user.id).toBe(vendorUser.id);
        expect(Array.isArray(res.body.stores)).toBe(true);
        expect(res.body.stores).toHaveLength(1);
        expect(res.body.stores[0].vendorId).toBe(vendorUser.id);
        expect(res.body.defaultVendorId).toBe(vendorUser.id);
        expect(res.body.requiresStoreSelection).toBe(false);
      });
  });

  it('/vendor-portal/auth/session (GET) - Rejects non-vendor accounts', async () => {
    await request(app.getHttpServer())
      .get('/vendor-portal/auth/session')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403)
      .expect((res: any) => {
        expect(res.body.message).toBe(
          'This account is not linked to any vendor store or staff workspace.',
        );
        expect(res.body.code).toBe('VENDOR_PORTAL_ACCESS_DENIED');
      });
  });

  it('Staff can list staff of the vendor they work for', () => {
    return request(app.getHttpServer())
      .get('/vendor/staff')
      .set('Authorization', `Bearer ${staffToken}`)
      .set('x-vendor-id', String(vendorUser.id))
      .expect(403);
  });

  it('Staff with permission can list staff', async () => {
    // Use the stored staffRecordId from the Invite test
    if (!staffRecordId)
      throw new Error('Staff record ID not found from previous test');

    // 2. Grant STAFF_MANAGE permission (as Vendor)
    await request(app.getHttpServer())
      .patch(`/vendor/staff/${staffRecordId}`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .set('x-vendor-id', String(vendorUser.id))
      .send({
        permissions: [
          VendorPermission.STAFF_MANAGE,
          VendorPermission.MANAGE_PRODUCTS,
        ],
      })
      .expect(200);

    // 3. Verify access (as Staff)
    return request(app.getHttpServer())
      .get('/vendor/staff')
      .set('Authorization', `Bearer ${staffToken}`)
      .set('x-vendor-id', String(vendorUser.id))
      .expect(200);
  });
});
