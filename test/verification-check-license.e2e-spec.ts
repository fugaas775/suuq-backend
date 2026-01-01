/* eslint-disable @typescript-eslint/unbound-method */
import {
  INestApplication,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Module } from '@nestjs/common';
import { VerificationController } from '../src/verification/verification.controller';
import { DoSpacesService } from '../src/media/do-spaces.service';
import { VerificationService } from '../src/verification/verification.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { UsersService } from '../src/users/users.service';
import { ETradeVerificationService } from '../src/verification/etrade-verification.service';
import {
  VerificationStatus,
  VerificationMethod,
} from '../src/users/entities/user.entity';

class AllowGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { id: 99, email: 'vendor@example.com', roles: ['VENDOR'] };
    return true;
  }
}

// Lightweight mock modules to satisfy imported module graphs without real DB
@Module({
  controllers: [VerificationController],
  providers: [
    VerificationService,
    { provide: UsersService, useValue: {} },
    { provide: ETradeVerificationService, useValue: {} },
    { provide: DoSpacesService, useValue: { uploadFile: jest.fn() } },
  ],
})
class TestVerificationModule {}

describe('Verification /check-license (e2e-lite)', () => {
  let app: INestApplication;

  const usersServiceMock = {
    update: jest.fn().mockResolvedValue(undefined),
  } as unknown as UsersService;

  const etradeMock = {
    verifyLicense: jest.fn().mockResolvedValue({
      tradeName: 'ACME Trading',
      legalCondition: 'PLC',
      capital: '1,000,000 ETB',
      registeredDate: '2024-01-01',
      renewalDate: '2025-01-01',
      status: 'Valid',
    }),
  } as unknown as ETradeVerificationService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestVerificationModule],
    })
      .overrideProvider(UsersService)
      .useValue(usersServiceMock)
      .overrideProvider(ETradeVerificationService)
      .useValue(etradeMock)
      .overrideGuard(JwtAuthGuard)
      .useClass(AllowGuard)
      .overrideGuard(RolesGuard)
      .useClass(AllowGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /verification/check-license approves user automatically', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/verification/check-license')
      .send({ businessLicenseNumber: 'LIC-123' })
      .expect(201);

    expect(res.body.tradeName).toBe('ACME Trading');
    expect(etradeMock.verifyLicense).toHaveBeenCalledWith('LIC-123');
    expect(usersServiceMock.update).toHaveBeenCalledWith(
      99,
      expect.objectContaining({
        verificationStatus: VerificationStatus.APPROVED,
        verificationMethod: VerificationMethod.AUTOMATIC,
        businessLicenseNumber: 'LIC-123',
      }),
    );
  });

  it('POST /verification/check-license returns 404 for invalid license', async () => {
    // Arrange: cause next verification call to reject
    (etradeMock.verifyLicense as any).mockRejectedValueOnce(
      new (require('@nestjs/common').NotFoundException)(
        'License number not found or is invalid.',
      ),
    );

    const res = await request(app.getHttpServer())
      .post('/api/verification/check-license')
      .send({ businessLicenseNumber: 'BAD-LIC' })
      .expect(404);

    expect(res.body.message).toMatch(/invalid/i);
    // Ensure user update NOT called for failure path
    expect(usersServiceMock.update).not.toHaveBeenCalledWith(
      99,
      expect.objectContaining({ businessLicenseNumber: 'BAD-LIC' }),
    );
  });
});
