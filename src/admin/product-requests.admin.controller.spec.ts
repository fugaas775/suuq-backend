import { Test, TestingModule } from '@nestjs/testing';
import { AdminProductRequestsController } from './product-requests.admin.controller';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductRequest } from '../product-requests/entities/product-request.entity';
import { ProductRequestForward } from '../product-requests/entities/product-request-forward.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { ProductRequestStatus } from '../product-requests/entities/product-request.entity';

describe('AdminProductRequestsController - Forward Validation', () => {
  let controller: AdminProductRequestsController;
  let mockUserRepo: any;
  let mockForwardRepo: any;
  let mockRequestRepo: any;
  let mockNotifications: any;
  let mockEmailService: any;
  let requestQueryBuilder: any;

  beforeEach(async () => {
    requestQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      loadRelationCountAndMap: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          title: 'Test Request',
          buyerId: 50,
          buyer: { email: 'buyer@example.com' },
          category: { name: 'Food' },
        },
      ]),
    };

    mockUserRepo = {
      find: jest.fn(),
    };
    mockForwardRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      save: jest.fn(),
    };
    mockRequestRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 1, title: 'Test Request' }),
      createQueryBuilder: jest.fn().mockReturnValue(requestQueryBuilder),
    };
    mockNotifications = {
      sendToUser: jest.fn().mockResolvedValue(undefined),
    };
    mockEmailService = {
      sendProductRequestForwardedToVendor: jest
        .fn()
        .mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminProductRequestsController],
      providers: [
        {
          provide: getRepositoryToken(ProductRequest),
          useValue: mockRequestRepo,
        },
        {
          provide: getRepositoryToken(ProductRequestForward),
          useValue: mockForwardRepo,
        },
        { provide: getRepositoryToken(User), useValue: mockUserRepo }, // Mock User Repo
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    controller = module.get<AdminProductRequestsController>(
      AdminProductRequestsController,
    );
  });

  it('should skip missing vendor and return forwarding summary', async () => {
    const vendorId = 123;
    const dto = { vendorIds: [vendorId] };
    const req: any = { user: { id: 999 } }; // Admin

    // Mock User Repo with no matching users for this vendor id
    mockUserRepo.find.mockResolvedValue([]);

    const result: any = await controller.forward(1, dto, req);

    expect(result.forwardingSummary).toEqual(
      expect.objectContaining({
        requestedCount: 1,
        createdCount: 0,
        skippedNonProVendorIds: [],
        skippedMissingVendorIds: [vendorId],
      }),
    );
    expect(mockForwardRepo.save).not.toHaveBeenCalled();
  });

  it('should succeed if forwarding to existing vendor', async () => {
    const vendorId = 456;
    const dto = { vendorIds: [vendorId] };
    const req: any = { user: { id: 999 } };

    mockUserRepo.find
      .mockResolvedValueOnce([{ id: vendorId }])
      .mockResolvedValueOnce([
        {
          id: vendorId,
          email: 'vendor@example.com',
          displayName: 'Vendor One',
          storeName: 'Vendor One Store',
        },
      ]);

    await controller.forward(1, dto, req);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockForwardRepo.save).toHaveBeenCalled();
    expect(mockNotifications.sendToUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: vendorId }),
    );
    expect(
      mockEmailService.sendProductRequestForwardedToVendor,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: vendorId, email: 'vendor@example.com' }),
      { id: 1, title: 'Test Request' },
      undefined,
    );
  });

  it('lists product requests with the default limit', async () => {
    const result = await controller.list({});

    expect(mockRequestRepo.createQueryBuilder).toHaveBeenCalledWith('request');
    expect(requestQueryBuilder.take).toHaveBeenCalledWith(50);
    expect(result).toEqual([
      expect.objectContaining({
        id: 1,
        categoryName: 'Food',
        buyerName: 'buyer@example.com',
      }),
    ]);
  });

  it('applies a single validated status filter', async () => {
    await controller.list({
      status: [ProductRequestStatus.OPEN],
      limit: 25,
    });

    expect(requestQueryBuilder.take).toHaveBeenCalledWith(25);
    expect(requestQueryBuilder.where).toHaveBeenCalledWith(
      'request.status = :status',
      { status: ProductRequestStatus.OPEN },
    );
  });

  it('applies multi-status filters without reparsing raw query strings', async () => {
    await controller.list({
      status: [ProductRequestStatus.OPEN, ProductRequestStatus.IN_PROGRESS],
    });

    expect(requestQueryBuilder.where).toHaveBeenCalledWith(
      'request.status IN (:...statuses)',
      {
        statuses: [ProductRequestStatus.OPEN, ProductRequestStatus.IN_PROGRESS],
      },
    );
  });
});
