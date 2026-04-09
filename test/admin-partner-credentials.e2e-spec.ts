import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { PartnerCredentialsController } from '../src/partner-credentials/partner-credentials.controller';
import { PartnerCredentialsService } from '../src/partner-credentials/partner-credentials.service';
import {
  PartnerCredentialSortField,
  SortDirection,
} from '../src/partner-credentials/dto/partner-credential-list-query.dto';
import {
  DEFAULT_POS_PARTNER_SCOPES,
  PosPartnerScope,
} from '../src/partner-credentials/partner-credential-scopes';
import {
  PartnerCredentialStatus,
  PartnerType,
} from '../src/partner-credentials/entities/partner-credential.entity';

describe('PartnerCredentialsController (e2e)', () => {
  let app: INestApplication;
  let partnerCredentialsService: {
    findAll: jest.Mock;
    create: jest.Mock;
  };

  beforeAll(async () => {
    partnerCredentialsService = {
      findAll: jest.fn().mockResolvedValue({
        items: [
          {
            id: 10,
            name: 'Front Lane Cashier',
            partnerType: PartnerType.POS,
            branchId: 3,
            branch: {
              id: 3,
              name: 'Main Branch',
              code: 'MB-01',
              city: 'Mogadishu',
              country: 'Somalia',
            },
            scopes: [PosPartnerScope.POS_CHECKOUT_READ],
            keyHash: 'should-not-be-exposed',
            status: PartnerCredentialStatus.ACTIVE,
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:05:00.000Z'),
          },
        ],
        total: 1,
        page: 1,
        perPage: 20,
        totalPages: 1,
      }),
      create: jest.fn(async (dto) => {
        if (dto.partnerType !== PartnerType.POS && dto.scopePreset) {
          throw new BadRequestException(
            'scopePreset is only supported for POS partner credentials',
          );
        }

        return {
          id: 11,
          name: dto.name,
          partnerType: dto.partnerType,
          branchId: dto.branchId ?? null,
          branch: null,
          scopes:
            dto.partnerType === PartnerType.POS
              ? DEFAULT_POS_PARTNER_SCOPES
              : (dto.scopes ?? []),
          keyHash: 'should-not-be-exposed',
          status: PartnerCredentialStatus.ACTIVE,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          updatedAt: new Date('2026-04-01T00:05:00.000Z'),
        };
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PartnerCredentialsController],
      providers: [
        {
          provide: PartnerCredentialsService,
          useValue: partnerCredentialsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 7, email: 'admin@test.com', roles: ['ADMIN'] };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists partner credentials using the documented admin response shape', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/v1/partner-credentials')
      .query({ partnerType: 'POS', page: 1, limit: 20 })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        total: 1,
        page: 1,
        perPage: 20,
        items: [
          expect.objectContaining({
            id: 10,
            name: 'Front Lane Cashier',
            partnerType: 'POS',
            branchId: 3,
            scopes: [PosPartnerScope.POS_CHECKOUT_READ],
          }),
        ],
      }),
    );
    expect(response.body.items[0]).not.toHaveProperty('keyHash');
    expect(partnerCredentialsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ partnerType: 'POS', page: 1, limit: 20 }),
    );
  });

  it('passes list filters and sorting through the validated HTTP query contract', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/v1/partner-credentials')
      .query({
        partnerType: 'POS',
        status: 'ACTIVE',
        branchId: 3,
        search: 'main',
        page: 2,
        limit: 10,
        sortBy: PartnerCredentialSortField.NAME,
        sortDirection: SortDirection.ASC,
        secondarySortBy: PartnerCredentialSortField.UPDATED_AT,
        secondarySortDirection: SortDirection.DESC,
      })
      .expect(200);

    expect(partnerCredentialsService.findAll).toHaveBeenLastCalledWith({
      partnerType: 'POS',
      status: 'ACTIVE',
      branchId: 3,
      search: 'main',
      page: 2,
      limit: 10,
      sortBy: PartnerCredentialSortField.NAME,
      sortDirection: SortDirection.ASC,
      secondarySortBy: PartnerCredentialSortField.UPDATED_AT,
      secondarySortDirection: SortDirection.DESC,
    });
  });

  it('creates a POS credential over HTTP using scopePreset', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/v1/partner-credentials')
      .send({
        name: 'Front Lane Cashier',
        partnerType: 'POS',
        branchId: 3,
        scopePreset: 'CASHIER_TERMINAL',
        keyHash: 'terminal-secret',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: 11,
        name: 'Front Lane Cashier',
        partnerType: 'POS',
        branchId: 3,
        scopes: DEFAULT_POS_PARTNER_SCOPES,
        status: PartnerCredentialStatus.ACTIVE,
      }),
    );
    expect(response.body).not.toHaveProperty('keyHash');
    expect(partnerCredentialsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Front Lane Cashier',
        partnerType: 'POS',
        branchId: 3,
        scopePreset: 'CASHIER_TERMINAL',
      }),
    );
  });

  it('rejects non-POS credentials that try to use scopePreset', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/v1/partner-credentials')
      .send({
        name: 'Supplier Link',
        partnerType: 'SUPPLIER',
        scopePreset: 'FULL_TERMINAL',
        keyHash: 'terminal-secret',
      })
      .expect(400);

    expect(response.body.message).toBe(
      'scopePreset is only supported for POS partner credentials',
    );
  });

  it('rejects malformed preset payloads before service execution', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/v1/partner-credentials')
      .send({
        name: 'Front Lane Cashier',
        partnerType: 'POS',
        branchId: 3,
        scopePreset: 'NOT_REAL',
        keyHash: 'terminal-secret',
      })
      .expect(400);
  });

  it('rejects malformed list query values before service execution', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/v1/partner-credentials')
      .query({ sortBy: 'NOT_REAL', page: 0 })
      .expect(400);
  });
});
