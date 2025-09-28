import {
  INestApplication,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';

import { VendorPublicController } from '../src/vendor/vendor-public.controller';
import { VendorService } from '../src/vendor/vendor.service';
import { UsersService } from '../src/users/users.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { UsersController } from '../src/users/users.controller';
import { UserResponseDto } from '../src/users/dto/user-response.dto';
import { ProductsService } from '../src/products/products.service';

class AllowGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { id: 1, email: 'admin@example.com' };
    return true;
  }
}

describe('Public verification and profile (e2e-lite)', () => {
  let app: INestApplication;

  const usersServiceMock = {
    getPublicCertificates: jest.fn(),
    findById: jest.fn(),
    setVerificationStatus: jest.fn(),
  } as unknown as UsersService;

  const vendorServiceMock = {
    getPublicProfile: jest.fn(),
  } as unknown as VendorService;

  const productsServiceMock = {
    findFiltered: jest.fn().mockResolvedValue({ items: [] }),
  } as unknown as ProductsService;

  const authServiceMock = {
    getUsersService: () => usersServiceMock,
    // other methods not needed for these tests
  } as unknown as AuthService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VendorPublicController, AuthController, UsersController],
      providers: [
        { provide: VendorService, useValue: vendorServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: ProductsService, useValue: productsServiceMock },
      ],
    })
      // Override guards to allow requests without JWT/roles for test
      .overrideGuard(JwtAuthGuard)
      .useClass(AllowGuard)
      .overrideGuard(RolesGuard)
      .useClass(AllowGuard as any)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /vendors/:id/certificates returns 2 items when approved', async () => {
    (vendorServiceMock.getPublicProfile as any).mockResolvedValueOnce({
      id: 42,
    });
    (usersServiceMock.getPublicCertificates as any).mockResolvedValueOnce([
      { url: 'https://cdn.example.com/doc1.pdf', name: 'doc1.pdf' },
      { url: 'https://cdn.example.com/doc2.pdf', name: 'doc2.pdf' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/vendors/42/certificates')
      .expect(200);

    expect(res.headers['cache-control']).toContain('max-age=300');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toEqual({
      id: undefined,
      name: expect.any(String),
      type: 'BUSINESS_LICENSE',
      mimeType: undefined,
      url: expect.any(String),
      thumbnailUrl: undefined,
      status: 'APPROVED',
      issuedBy: undefined,
      issueDate: undefined,
      expiryDate: undefined,
      uploadedAt: undefined,
    });
  });

  it('GET /vendors/:id/certificates returns empty items when not approved', async () => {
    (vendorServiceMock.getPublicProfile as any).mockResolvedValueOnce({
      id: 43,
    });
    (usersServiceMock.getPublicCertificates as any).mockResolvedValueOnce([]);

    const res = await request(app.getHttpServer())
      .get('/api/vendors/43/certificates')
      .expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('GET /auth/profile includes verificationStatus', async () => {
    (usersServiceMock.findById as any).mockResolvedValueOnce({
      id: 1,
      email: 'user@example.com',
      roles: ['CUSTOMER'],
      verificationStatus: 'APPROVED',
      verified: true,
    });

    const res = await request(app.getHttpServer())
      .get('/api/auth/profile')
      .expect(200);

    const body: UserResponseDto = res.body;
    expect(body).toHaveProperty('verificationStatus');
    expect(body.verificationStatus).toBe('APPROVED');
  });

  it('PATCH /users/:id/verify updates status', async () => {
    (usersServiceMock.setVerificationStatus as any).mockResolvedValueOnce({
      id: 21,
      email: 'vendor@example.com',
      roles: ['VENDOR'],
      verificationStatus: 'APPROVED',
      verified: true,
    });

    const res = await request(app.getHttpServer())
      .patch('/api/users/21/verify')
      .send({ status: 'APPROVED' })
      .expect(200);

    expect(res.body.verificationStatus).toBe('APPROVED');
  });
});
