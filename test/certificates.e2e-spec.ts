import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { UserRole } from '../src/auth/roles.enum';
import { VerificationStatus } from '../src/users/entities/user.entity';
import { DataSource } from 'typeorm';

describe('Public Certificates & Profile (e2e)', () => {
  let app: INestApplication;
  let usersService: UsersService;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    usersService = app.get(UsersService);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('returns empty certificates for PENDING vendor', async () => {
    const email = `pending_vendor_${Date.now()}@example.com`;
    const vendor = await usersService.create({
      email,
      password: 'Passw0rd!',
      roles: [UserRole.VENDOR],
      verificationStatus: VerificationStatus.PENDING,
      verificationDocuments: [
        { url: 'https://cdn.example.com/doc1.pdf', name: 'doc1.pdf' },
      ],
    });

    const res = await request(app.getHttpServer())
      .get(`/api/vendors/${vendor.id}/certificates`)
      .expect(200);

    expect(res.headers['cache-control']).toContain('public');
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(0);
  });

  it('approves vendor and exposes certificates publicly', async () => {
    // Create vendor with docs
    const vEmail = `approved_vendor_${Date.now()}@example.com`;
    const vendor = await usersService.create({
      email: vEmail,
      password: 'Passw0rd!',
      roles: [UserRole.VENDOR],
      verificationStatus: VerificationStatus.PENDING,
      verificationDocuments: [
        { url: 'https://cdn.example.com/license1.pdf', name: 'license1.pdf' },
        { url: 'https://cdn.example.com/license2.pdf', name: 'license2.pdf' },
      ],
    });

    // Create admin and login to get token
    const aEmail = `admin_${Date.now()}@example.com`;
    await usersService.create({
      email: aEmail,
      password: 'AdminPassw0rd!',
      roles: [UserRole.ADMIN],
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: aEmail, password: 'AdminPassw0rd!' })
      .expect(200);
    const token = login.body.accessToken as string;

    // Approve vendor via admin endpoint
    await request(app.getHttpServer())
      .patch(`/api/users/${vendor.id}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'APPROVED' })
      .expect(200);

    // Public fetch should now return 2 items
    const res = await request(app.getHttpServer())
      .get(`/api/vendors/${vendor.id}/certificates`)
      .expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(2);
    expect(res.body.items[0]).toMatchObject({
      name: 'license1.pdf',
      url: 'https://cdn.example.com/license1.pdf',
      type: 'BUSINESS_LICENSE',
      status: 'APPROVED',
    });
  });

  it('profile includes verificationStatus', async () => {
    const email = `profile_user_${Date.now()}@example.com`;
    await usersService.create({
      email,
      password: 'Passw0rd!',
      roles: [UserRole.CUSTOMER],
      verificationStatus: VerificationStatus.UNVERIFIED,
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Passw0rd!' })
      .expect(200);
    const token = login.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('verificationStatus');
    expect(typeof res.body.verificationStatus).toBe('string');
  });
});
