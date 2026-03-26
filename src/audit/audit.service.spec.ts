import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from './audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;
  let repo: { createQueryBuilder: jest.Mock };
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    take: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(async () => {
    queryBuilder = {
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      take: jest.fn(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    queryBuilder.addOrderBy.mockReturnValue(queryBuilder);
    queryBuilder.take.mockReturnValue(queryBuilder);

    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: repo,
        },
      ],
    }).compile();

    service = module.get(AuditService);
  });

  it('rejects malformed global audit cursors', async () => {
    await expect(
      service.listAllCursor({ after: 'not-a-valid-audit-cursor' }),
    ).rejects.toThrow(new BadRequestException('Invalid audit cursor'));
    expect(queryBuilder.getMany).not.toHaveBeenCalled();
  });

  it('rejects malformed target audit cursors', async () => {
    await expect(
      service.listForTargetCursor('vendor', 12, {
        after: 'not-a-valid-audit-cursor',
      }),
    ).rejects.toThrow(new BadRequestException('Invalid audit cursor'));
    expect(queryBuilder.getMany).not.toHaveBeenCalled();
  });

  it('applies valid audit cursors to descending createdAt and id scans', async () => {
    const after = Buffer.from('2026-03-20T10:45:00.000Z|77', 'utf8').toString(
      'base64url',
    );

    await service.listAllCursor({ after, limit: 20 });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(a.createdAt < :createdAt OR (a.createdAt = :createdAt AND a.id < :id))',
      {
        createdAt: new Date('2026-03-20T10:45:00.000Z'),
        id: 77,
      },
    );
    expect(queryBuilder.take).toHaveBeenCalledWith(21);
    expect(queryBuilder.getMany).toHaveBeenCalled();
  });
});
