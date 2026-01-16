import { ProductsV1Controller } from './v1.products.controller';

describe('ProductsV1Controller detail', () => {
  const mockProductsService = {
    findOne: jest.fn(),
  };
  const mockCategoryRepo = {} as any;
  const mockFavoritesService = {} as any;
  const mockReviewsService = {} as any;
  const mockListingService = {} as any;

  const controller = new ProductsV1Controller(
    mockProductsService as any,
    mockCategoryRepo,
    mockFavoritesService,
    mockReviewsService,
    mockListingService,
  );

  const product = {
    id: 42,
    name: 'Sample Product',
    price: 999,
    currency: 'ETB',
    createdAt: new Date('2025-11-23T00:00:00Z'),
    images: [
      {
        src: 'https://example.com/full_123.jpg',
        thumbnailSrc: 'https://example.com/thumb_123.jpg',
        lowResSrc: 'https://example.com/lowres_123.jpg',
      },
    ],
    vendor: {
      id: 9,
      email: 'vendor@example.com',
      displayName: 'Vendor',
      avatarUrl: 'https://example.com/avatar.jpg',
      storeName: 'Store',
      verified: true,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockProductsService.findOne.mockResolvedValue(product);
  });

  it('returns full product payload by default', async () => {
    const result = await controller.detail(42, 'full');
    expect(mockProductsService.findOne).toHaveBeenCalledWith(42, undefined);
    expect(result).toBe(product);
  });

  it('returns grid card when requested', async () => {
    const result = await controller.detail(42, 'grid');
    expect(result).toMatchObject({
      id: 42,
      name: 'Sample Product',
      primaryImage: {
        src: 'https://example.com/full_123.jpg',
        thumbnail: 'https://example.com/thumb_123.jpg',
        lowRes: 'https://example.com/lowres_123.jpg',
      },
    });
  });
});
