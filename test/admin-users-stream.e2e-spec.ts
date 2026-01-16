import {
  INestApplication,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AdminController } from '../src/admin/admin.controller';
import { UsersService } from '../src/users/users.service';
import { RolesGuard } from '../src/auth/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '../src/auth/roles.enum';
import { VerificationStatus } from '../src/users/entities/user.entity';
import { OrdersService } from '../src/orders/orders.service';
import { WithdrawalsService } from '../src/withdrawals/withdrawals.service';

class AllowGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

import { CurrencyService } from '../src/common/services/currency.service';
import { ProductsService } from '../src/products/products.service';

describe('GET /admin/users/stream (e2e)', () => {
  let app: INestApplication;
  let calls = 0;

  const mockUsers: any[] = [
    {
      id: 1,
      email: 'vendor1@example.com',
      displayName: 'Vendor One',
      storeName: 'Electro World',
      roles: [UserRole.VENDOR],
      isActive: true,
      verificationStatus: VerificationStatus.APPROVED,
      verificationMethod: 'MANUAL',
    },
    {
      id: 2,
      email: 'vendor2@example.com',
      displayName: 'Vendor Two',
      storeName: 'Electro World 2',
      roles: [UserRole.VENDOR],
      isActive: true,
      verificationStatus: VerificationStatus.APPROVED,
      verificationMethod: 'MANUAL',
    },
  ];

  const usersServiceMock: Partial<UsersService> = {
    async findAll(filters: any) {
      // Return data only on first call; then empty to end stream
      if (calls++ === 0) {
        return {
          users: mockUsers,
          total: mockUsers.length,
          page: filters?.page || 1,
          pageSize: filters?.pageSize || 100,
        } as any;
      }
      return {
        users: [],
        total: mockUsers.length,
        page: 2,
        pageSize: filters?.pageSize || 100,
      } as any;
    },
  } as any;

  beforeAll(async () => {
    const JwtGuard = AuthGuard('jwt');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: UsersService, useValue: usersServiceMock },
        // Unused in this test but required by controller constructor
        { provide: OrdersService, useValue: {} },
        { provide: CurrencyService, useValue: {} },
        { provide: ProductsService, useValue: {} },
      ],
    })
      .overrideGuard(RolesGuard)
      .useClass(AllowGuard)
      .overrideGuard(JwtGuard as any)
      .useClass(AllowGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('streams NDJSON with correct headers and line format', async () => {
    const server = app.getHttpServer();
    const res = await request(server)
      .get('/admin/users/stream?role=VENDOR&status=active&chunkSize=100')
      .set('Authorization', 'Bearer test')
      .buffer(true)
      .parse((res, cb) => {
        // Accumulate raw text
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => cb(null, data));
      });

    // Debug on failures
    if (res.status !== 200) {
      console.log(
        'STREAM DEBUG status=',
        res.status,
        'headers=',
        res.headers,
        'body=',
        String(res.body || ''),
      );
    }

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    expect(res.headers['content-disposition']).toContain('users.ndjson');

    const lines = String(res.body).trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const obj = JSON.parse(lines[0]);
    expect(obj).toHaveProperty('id');
    expect(obj).toHaveProperty('email');
    expect(Array.isArray(obj.roles)).toBe(true);
  });
});
