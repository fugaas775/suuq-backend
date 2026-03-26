import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SearchLog } from '../search/entities/search-log.entity';
import { AdminSearchLogController } from './search-log.admin.controller';

describe('AdminSearchLogController', () => {
  let controller: AdminSearchLogController;
  let queryBuilder: {
    orderBy: jest.Mock;
    take: jest.Mock;
    andWhere: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(async () => {
    queryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSearchLogController],
      providers: [
        {
          provide: getRepositoryToken(SearchLog),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
          },
        },
      ],
    }).compile();

    controller = module.get(AdminSearchLogController);
  });

  it('uses validated search-log filters and trims search text', async () => {
    await controller.list({ q: '  beans  ', source: '  mobile  ', limit: 75 });

    expect(queryBuilder.take).toHaveBeenCalledWith(75);
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      'log.query ILIKE :q',
      { q: '%beans%' },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      'log.source = :source',
      { source: 'mobile' },
    );
  });

  it('defaults the search-log limit to 50 when omitted', async () => {
    await controller.list({});

    expect(queryBuilder.take).toHaveBeenCalledWith(50);
  });
});
