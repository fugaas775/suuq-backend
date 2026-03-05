import { Test, TestingModule } from '@nestjs/testing';
import { AdminProductRequestsController } from './product-requests.admin.controller';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductRequest } from '../product-requests/entities/product-request.entity';
import { ProductRequestForward } from '../product-requests/entities/product-request-forward.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

describe('AdminProductRequestsController - Forward Validation', () => {
  let controller: AdminProductRequestsController;
  let mockUserRepo: any;
  let mockForwardRepo: any;
  let mockRequestRepo: any;

  beforeEach(async () => {
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
        { provide: NotificationsService, useValue: { sendToUser: jest.fn() } },
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

    // Mock User Repo to return an existing vendor candidate
    mockUserRepo.find.mockResolvedValue([{ id: vendorId }]);

    await controller.forward(1, dto, req);

    expect(mockForwardRepo.save).toHaveBeenCalled();
  });
});
