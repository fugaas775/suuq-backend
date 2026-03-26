import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AdminCreditController } from '../src/admin/credit.admin.controller';
import { CreditService } from '../src/credit/credit.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';

describe('AdminCreditController query contract (e2e)', () => {
  let app: INestApplication;
  let creditService: {
    findAllLimits: jest.Mock;
    setLimit: jest.Mock;
    repayCredit: jest.Mock;
    getTransactions: jest.Mock;
    deleteCreditLimit: jest.Mock;
  };

  beforeAll(async () => {
    creditService = {
      findAllLimits: jest.fn().mockResolvedValue({
        data: [{ id: 41, user: { id: 7, email: 'acme@suuq.test' } }],
        total: 1,
      }),
      setLimit: jest.fn(),
      repayCredit: jest.fn(),
      getTransactions: jest.fn(),
      deleteCreditLimit: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminCreditController],
      providers: [{ provide: CreditService, useValue: creditService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists credit users with validated filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/credit/users')
      .query({ page: '2', limit: '30', search: '  acme  ' })
      .expect(200);

    expect(creditService.findAllLimits).toHaveBeenCalledWith(2, 30, 'acme');
    expect(response.body).toEqual(
      expect.objectContaining({
        total: 1,
        data: [expect.objectContaining({ id: 41 })],
      }),
    );
  });

  it('rejects malformed credit list filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/credit/users?page=0')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/credit/users?limit=abc')
      .expect(400);
  });
});
