import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { AdminAuditController } from './audit.admin.controller';

describe('AdminAuditController', () => {
  let controller: AdminAuditController;
  let auditService: {
    listAllCursor: jest.Mock;
    listAllPaged: jest.Mock;
  };

  beforeEach(async () => {
    auditService = {
      listAllCursor: jest.fn(),
      listAllPaged: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAuditController],
      providers: [
        {
          provide: AuditService,
          useValue: auditService,
        },
      ],
    }).compile();

    controller = module.get(AdminAuditController);
  });

  it('delegates cursor-based audit listing unchanged', async () => {
    auditService.listAllCursor.mockResolvedValue({
      items: [
        {
          id: 5,
          action: 'vendor.verification.update',
          actorId: 7,
          actorEmail: 'ops@example.com',
          targetType: 'vendor',
          targetId: 12,
          meta: { status: 'APPROVED' },
          reason: 'Verified vendor',
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
      nextCursor: 'cursor:next',
    });

    const result = await controller.list({
      after: Buffer.from('2026-03-20T11:00:00.000Z|25', 'utf8').toString(
        'base64url',
      ),
      limit: 10,
      actions: 'vendor.verification.update',
      actorEmail: 'ops@example.com',
      targetType: 'vendor',
      targetId: 12,
    } as any);

    expect(auditService.listAllCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.any(String),
        limit: 10,
        targetType: 'vendor',
        targetId: 12,
        filters: expect.objectContaining({
          actions: ['vendor.verification.update'],
          actorEmail: 'ops@example.com',
        }),
      }),
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 5,
          action: 'vendor.verification.update',
          actionLabel: 'Approved vendor',
        }),
      ],
      nextCursor: 'cursor:next',
    });
  });

  it('accepts user target types for global audit browsing', async () => {
    auditService.listAllPaged.mockResolvedValue({
      items: [
        {
          id: 9,
          action: 'user.pos.assignment.create',
          actorId: 7,
          actorEmail: 'ops@example.com',
          targetType: 'user',
          targetId: 41,
          meta: { branchId: 8, role: 'OPERATOR' },
          reason: null,
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
      total: 1,
      perPage: 20,
      totalPages: 1,
      page: 1,
    });

    const result = await controller.list({
      page: 1,
      limit: 20,
      targetType: 'user',
      targetId: 41,
    } as any);

    expect(auditService.listAllPaged).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: 'user',
        targetId: 41,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            targetType: 'user',
            actionLabel: 'Assigned POS branch access',
          }),
        ],
      }),
    );
  });

  it('propagates malformed cursor failures from the audit service', async () => {
    auditService.listAllCursor.mockRejectedValue(
      new BadRequestException('Invalid audit cursor'),
    );

    await expect(
      controller.list({
        after: 'not-a-valid-audit-cursor',
      } as any),
    ).rejects.toThrow('Invalid audit cursor');
  });
});
