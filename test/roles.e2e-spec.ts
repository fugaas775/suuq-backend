import { INestApplication, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Module, Controller } from '@nestjs/common';
import { RolesController } from '../src/roles/roles.controller';
import { RolesService } from '../src/roles/roles.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RoleUpgradeStatus } from '../src/roles/entities/role-upgrade-request.entity';
import { UserRole } from '../src/auth/roles.enum';

class AllowGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { id: 42, email: 'user@example.com', roles: ['CUSTOMER'] };
    return true;
  }
}

// Minimal mock for RolesService
class RolesServiceMock {
  private latest: any | null = null;

  setLatest(v: any | null) {
    this.latest = v;
  }

  async requestUpgrade(userId: number, dto: any) {
    const now = new Date();
    this.latest = {
      id: 1,
      status: RoleUpgradeStatus.PENDING,
      roles: dto.roles,
      createdAt: now,
      updatedAt: now,
    };
    return this.latest;
  }

  async getLatestForUser(userId: number) {
    return this.latest;
  }
}

@Module({
  controllers: [RolesController],
  providers: [
    { provide: RolesService, useClass: RolesServiceMock },
  ],
})
class TestRolesModule {}

describe('Roles Endpoints (e2e-lite)', () => {
  let app: INestApplication;
  let rolesService: RolesServiceMock;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestRolesModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(AllowGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    rolesService = moduleRef.get(RolesService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /roles/upgrade-request/me returns 204 when none', async () => {
    rolesService.setLatest(null);
    await request(app.getHttpServer())
      .get('/api/roles/upgrade-request/me')
      .expect(204);
  });

  it('POST /roles/upgrade-request creates request and GET returns it', async () => {
    const payload = {
      roles: [UserRole.VENDOR],
      country: 'ET',
      phoneCountryCode: '+251',
      phoneNumber: '900000000',
      storeName: 'Test Store',
      businessLicenseNumber: 'LIC-123',
    };

    const postRes = await request(app.getHttpServer())
      .post('/api/roles/upgrade-request')
      .send(payload)
      .expect(201);

    expect(postRes.body).toHaveProperty('id');
    expect(postRes.body).toHaveProperty('status', RoleUpgradeStatus.PENDING);

    const getRes = await request(app.getHttpServer())
      .get('/api/roles/upgrade-request/me')
      .expect(200);

    expect(getRes.body).toMatchObject({
      id: 1,
      status: RoleUpgradeStatus.PENDING,
      roles: [UserRole.VENDOR],
    });
  });
});
