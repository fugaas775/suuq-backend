import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PATH_METADATA } from '@nestjs/common/constants';
import { AdminModerationController } from './moderation.admin.controller';
import { ProductImageModeration } from './entities/product-image-moderation.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { Product } from '../products/entities/product.entity';
import { UserReport } from './entities/user-report.entity';
import { ModerationScannerService } from './scanner.service';

describe('AdminModerationController aliases', () => {
  let controller: AdminModerationController;
  const mockPimRepo = {
    findAndCount: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPimRepo.findAndCount.mockResolvedValue([[], 0]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminModerationController],
      providers: [
        {
          provide: getRepositoryToken(ProductImageModeration),
          useValue: mockPimRepo,
        },
        {
          provide: getRepositoryToken(ProductImage),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: { update: jest.fn() },
        },
        {
          provide: getRepositoryToken(UserReport),
          useValue: {
            findAndCount: jest.fn(),
            update: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: ModerationScannerService,
          useValue: { processImage: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<AdminModerationController>(
      AdminModerationController,
    );
  });

  it('should keep queue alias paths registered', () => {
    const aliases = Reflect.getMetadata(PATH_METADATA, controller.queueAliases);
    expect(aliases).toEqual(['list', 'items', 'images', 'images/queue']);
  });

  it('should return queue payload from alias handler', async () => {
    const result = await controller.queueAliases(
      '1',
      '50',
      'confidence_desc',
      'flagged',
    );

    expect(result).toEqual({ items: [], total: 0, page: 1, perPage: 50 });
    expect(mockPimRepo.findAndCount).toHaveBeenCalledTimes(1);
  });
});
