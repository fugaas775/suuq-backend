import { ProductRequestsController } from './product-requests.controller';
import { ProductRequestsService } from './product-requests.service';
import { CreateProductRequestDto } from './dto/create-product-request.dto';
import { ListProductRequestQueryDto } from './dto/list-product-request-query.dto';
import { ListProductRequestFeedDto } from './dto/list-product-request-feed.dto';
import { CreateProductRequestOfferDto } from './dto/create-product-request-offer.dto';
import { UserRole } from '../auth/roles.enum';

describe('ProductRequestsController', () => {
  let controller: ProductRequestsController;
  const service: jest.Mocked<ProductRequestsService> = {
    createRequest: jest.fn(),
    listBuyerRequests: jest.fn(),
    findRequestForBuyer: jest.fn(),
    updateStatusAsBuyer: jest.fn(),
    listOffersForBuyer: jest.fn(),
    listSellerFeed: jest.fn(),
    createOffer: jest.fn(),
    listSellerOffersForRequest: jest.fn(),
    acceptOffer: jest.fn(),
    rejectOffer: jest.fn(),
    markOfferSeen: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ProductRequestsController(service);
  });

  it('creates product requests with the authenticated user id', async () => {
    const dto = { title: 'Gaming Laptop' } as CreateProductRequestDto;
    const req: any = { user: { id: 77, roles: [UserRole.CUSTOMER] } };
    service.createRequest.mockResolvedValue({ id: 1 } as any);

    const result = await controller.create(dto, req);

    expect(service.createRequest).toHaveBeenCalledWith(77, dto);
    expect(result).toEqual({ id: 1 });
  });

  it('delegates seller feed queries with user id and roles', async () => {
    const dto = { limit: 5 } as ListProductRequestFeedDto;
    const req: any = { user: { id: 99, roles: [UserRole.VENDOR] } };
    service.listSellerFeed.mockResolvedValue([]);

    await controller.sellerFeed(dto, req);

    expect(service.listSellerFeed).toHaveBeenCalledWith(
      99,
      req.user.roles,
      dto,
    );
  });

  it('creates offers using vendor context', async () => {
    const dto = { productId: 10 } as CreateProductRequestOfferDto;
    const req: any = { user: { id: 44, roles: [UserRole.VENDOR] } };
    service.createOffer.mockResolvedValue({ id: 55 } as any);

    const result = await controller.createOffer(3, dto, req);

    expect(service.createOffer).toHaveBeenCalledWith(
      44,
      req.user.roles,
      3,
      dto,
    );
    expect(result).toEqual({ id: 55 });
  });

  it('lists buyer requests using request-scoped filters', async () => {
    const dto = { limit: 10 } as ListProductRequestQueryDto;
    const req: any = { user: { id: 12 } };
    service.listBuyerRequests.mockResolvedValue([{ id: 1 }] as any);

    const result = await controller.listMine(dto, req);

    expect(service.listBuyerRequests).toHaveBeenCalledWith(12, dto);
    expect(result).toEqual([{ id: 1 }]);
  });
});
