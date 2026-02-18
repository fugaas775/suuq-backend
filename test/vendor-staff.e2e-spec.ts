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

describe('Vendor Staff Integration (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;

  let vendorToken: string;
  let vendorUser: User;

  let staffToken: string;
  let staffUser: User;
  let staffRecordId: number;

  const vendorEmail = `vendor_${Date.now()}@test.com`;
  const staffEmail = `staff_${Date.now()}@test.com`;
  const password = 'Password@123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

  afterAll(async () => {
    if (vendorUser) await userRepo.delete(vendorUser.id);
    if (staffUser) await userRepo.delete(staffUser.id);
    try {
      await app.close();
    } catch {
      /* ignore */
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
