import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PosWorkspaceActivationService } from '../src/branch-staff/pos-workspace-activation.service';
import { SellerWorkspaceController } from '../src/seller-workspace/seller-workspace.controller';
import { SellerWorkspaceService } from '../src/seller-workspace/seller-workspace.service';

describe('SellerWorkspaceController initiate-payment contract (e2e)', () => {
  let app: INestApplication;
  let posWorkspaceActivationService: {
    startAdditionalBranchCreationPayment: jest.Mock;
  };

  beforeAll(async () => {
    posWorkspaceActivationService = {
      startAdditionalBranchCreationPayment: jest.fn().mockResolvedValue({
        status: 'PENDING',
        referenceId: 'ebr-123',
        checkoutUrl: 'https://payments.example.test/ebr-123',
        providerMessage: 'Confirm in Ebirr',
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SellerWorkspaceController],
      providers: [
        { provide: SellerWorkspaceService, useValue: {} },
        {
          provide: PosWorkspaceActivationService,
          useValue: posWorkspaceActivationService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            id: 41,
            email: 'seller@suuq.test',
            roles: ['POS_MANAGER'],
          };
          return true;
        },
      })
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

  it('accepts BARBER on branch-workspaces/initiate-payment and forwards the validated payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/seller/v1/workspace/branch-workspaces/initiate-payment')
      .send({
        branchName: 'Bole Barber',
        city: 'Addis Ababa',
        country: 'Ethiopia',
        address: 'Bole Atlas',
        serviceFormat: 'barber',
        defaultCurrency: 'etb',
        phoneNumber: '0911000000',
        phone: '0911000000',
        tinNumber: '1234567890',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'PENDING',
        referenceId: 'ebr-123',
      }),
    );
    expect(
      posWorkspaceActivationService.startAdditionalBranchCreationPayment,
    ).toHaveBeenCalledWith(
      {
        id: 41,
        roles: ['POS_MANAGER'],
        email: 'seller@suuq.test',
      },
      expect.objectContaining({
        branchName: 'Bole Barber',
        city: 'Addis Ababa',
        country: 'Ethiopia',
        address: 'Bole Atlas',
        serviceFormat: 'BARBER',
        defaultCurrency: 'ETB',
        phoneNumber: '0911000000',
        phone: '0911000000',
        tinNumber: '1234567890',
      }),
    );
  });
});
