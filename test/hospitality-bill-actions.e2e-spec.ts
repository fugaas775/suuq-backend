import { CanActivate, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
const request = require('supertest');
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { HospitalityWorkflowsController } from '../src/hospitality/hospitality-workflows.controller';
import { HospitalityWorkflowsService } from '../src/hospitality/hospitality-workflows.service';
import { closeE2eApp } from './utils/e2e-cleanup';

class MockJwtAuthGuard implements CanActivate {
  canActivate(context: any) {
    const req = context.switchToHttp().getRequest();
    const authHeader = String(req.headers?.authorization || '').trim();

    if (!authHeader) {
      return false;
    }

    req.user = {
      id: 17,
      email: 'manager@suuq.test',
      roles: ['POS_MANAGER'],
    };
    return true;
  }
}

describe('Hospitality Bill Actions (e2e)', () => {
  let app: INestApplication;
  let hospitalityWorkflowsService: {
    splitOpenBill: jest.Mock;
    reopenSettledBill: jest.Mock;
    voidSettledBill: jest.Mock;
  };

  beforeAll(async () => {
    hospitalityWorkflowsService = {
      splitOpenBill: jest.fn(async (branchId, billId, dto, actor) => ({
        status: 'SPLIT',
        branchId,
        sourceBill: {
          billId,
          billLabel: 'Check 4',
          itemCount: dto.lineIds.length,
          grandTotal: 88.5,
          currency: 'ETB',
        },
        targetBill: {
          billId: `${billId}-SPLIT-1`,
          billLabel: dto.targetBillLabel || 'Split 1',
          itemCount: dto.lineIds.length,
          grandTotal: 88.5,
          currency: 'ETB',
        },
        intervention: {
          actionType: 'SPLIT',
          lifecycleStatus: 'OPEN',
          actor,
        },
      })),
      reopenSettledBill: jest.fn(async (branchId, billId, dto, actor) => ({
        status: 'UPDATED',
        branchId,
        bill: {
          billId,
          billLabel: 'Check 4',
          lifecycleStatus: 'ACTIVE',
        },
        receipt: {
          receiptId: 'rcpt-1',
          receiptNumber: 'RCPT-1',
          lifecycleStatus: 'REOPENED',
        },
        intervention: {
          actionType: 'REOPEN',
          reason: dto.reason,
          actor,
        },
      })),
      voidSettledBill: jest.fn(async (branchId, billId, dto, actor) => ({
        status: 'UPDATED',
        branchId,
        bill: {
          billId,
          billLabel: 'Check 8',
          lifecycleStatus: 'VOIDED',
        },
        receipt: {
          receiptId: 'rcpt-8',
          receiptNumber: 'RCPT-8',
          lifecycleStatus: 'VOIDED',
        },
        intervention: {
          actionType: 'VOID',
          reason: dto.reason,
          actor,
        },
      })),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HospitalityWorkflowsController],
      providers: [
        {
          provide: HospitalityWorkflowsService,
          useValue: hospitalityWorkflowsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new MockJwtAuthGuard())
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await closeE2eApp({ app });
  });

  it('rejects unauthenticated split requests through the route guard', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/v1/branches/21/bills/check-4/split')
      .send({
        lineIds: ['line-1'],
        idempotencyKey: 'split-guard',
      })
      .expect(403);
  });

  it('validates split request DTOs and returns the service response shape', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/v1/branches/21/bills/check-4/split')
      .set('Authorization', 'Bearer test-token')
      .send({
        lineIds: [],
        idempotencyKey: 'split-invalid',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/pos/v1/branches/21/bills/check-4/split')
      .set('Authorization', 'Bearer test-token')
      .send({
        lineIds: ['line-1', 'line-2'],
        targetBillLabel: 'Patio Split',
        reason: 'Guest requested split payment',
        idempotencyKey: 'split-valid',
        ignoredField: 'drop-me',
      })
      .expect(201)
      .expect((res: any) => {
        expect(res.body).toMatchObject({
          status: 'SPLIT',
          branchId: 21,
          sourceBill: {
            billId: 'check-4',
          },
          targetBill: {
            billId: 'check-4-SPLIT-1',
            billLabel: 'Patio Split',
          },
          intervention: {
            actionType: 'SPLIT',
            lifecycleStatus: 'OPEN',
            actor: {
              id: 17,
              email: 'manager@suuq.test',
            },
          },
        });
      });

    expect(hospitalityWorkflowsService.splitOpenBill).toHaveBeenCalledWith(
      21,
      'check-4',
      expect.not.objectContaining({ ignoredField: 'drop-me' }),
      expect.objectContaining({ id: 17, email: 'manager@suuq.test' }),
    );
  });

  it('validates reopen request DTOs and delegates to the service', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/v1/branches/21/bills/check-4/reopen')
      .set('Authorization', 'Bearer test-token')
      .send({
        confirmed: 'yes',
        idempotencyKey: 'reopen-invalid',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/pos/v1/branches/21/bills/check-4/reopen')
      .set('Authorization', 'Bearer test-token')
      .send({
        reason: 'Manager approved reopen after settlement correction',
        confirmed: true,
        idempotencyKey: 'reopen-valid',
      })
      .expect(201)
      .expect((res: any) => {
        expect(res.body).toMatchObject({
          status: 'UPDATED',
          branchId: 21,
          bill: {
            billId: 'check-4',
            lifecycleStatus: 'ACTIVE',
          },
          receipt: {
            lifecycleStatus: 'REOPENED',
          },
          intervention: {
            actionType: 'REOPEN',
            actor: {
              id: 17,
              email: 'manager@suuq.test',
            },
          },
        });
      });
  });

  it('validates void request DTOs and delegates to the service', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/v1/branches/21/bills/check-8/void')
      .set('Authorization', 'Bearer test-token')
      .send({
        reason: 123,
        confirmed: true,
        idempotencyKey: 'void-invalid',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/pos/v1/branches/21/bills/check-8/void')
      .set('Authorization', 'Bearer test-token')
      .send({
        reason: 'Duplicate payment reversal',
        confirmed: true,
        idempotencyKey: 'void-valid',
      })
      .expect(201)
      .expect((res: any) => {
        expect(res.body).toMatchObject({
          status: 'UPDATED',
          branchId: 21,
          bill: {
            billId: 'check-8',
            lifecycleStatus: 'VOIDED',
          },
          receipt: {
            lifecycleStatus: 'VOIDED',
          },
          intervention: {
            actionType: 'VOID',
            actor: {
              id: 17,
              email: 'manager@suuq.test',
            },
          },
        });
      });
  });
});
