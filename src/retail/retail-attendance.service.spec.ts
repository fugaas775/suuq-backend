import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from '../branch-staff/entities/branch-staff-assignment.entity';
import { User } from '../users/entities/user.entity';
import { RetailEntitlementsService } from './retail-entitlements.service';
import { RetailModule } from './entities/tenant-module-entitlement.entity';
import { HrAttendanceLog } from './entities/hr-attendance-log.entity';
import { RetailAttendanceService } from './retail-attendance.service';
import { RetailHrAttendanceComplianceStatusFilter } from './dto/retail-hr-attendance-compliance-export-query.dto';
import {
  RetailHrAttendanceExceptionPriorityFilter,
  RetailHrAttendanceExceptionQueueFilter,
} from './dto/retail-hr-attendance-exceptions-query.dto';

describe('RetailAttendanceService', () => {
  let service: RetailAttendanceService;
  let branchesRepository: { find: jest.Mock };
  let usersRepository: { find: jest.Mock };
  let branchStaffAssignmentsRepository: { find: jest.Mock; findOne: jest.Mock };
  let hrAttendanceLogsRepository: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let retailEntitlementsService: { assertBranchHasModules: jest.Mock };

  beforeEach(async () => {
    branchesRepository = {
      find: jest.fn(),
    };
    usersRepository = {
      find: jest.fn(),
    };
    branchStaffAssignmentsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    hrAttendanceLogsRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: value.id ?? 99, ...value })),
    };
    retailEntitlementsService = {
      assertBranchHasModules: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetailAttendanceService,
        {
          provide: getRepositoryToken(Branch),
          useValue: branchesRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: usersRepository,
        },
        {
          provide: getRepositoryToken(BranchStaffAssignment),
          useValue: branchStaffAssignmentsRepository,
        },
        {
          provide: getRepositoryToken(HrAttendanceLog),
          useValue: hrAttendanceLogsRepository,
        },
        {
          provide: RetailEntitlementsService,
          useValue: retailEntitlementsService,
        },
      ],
    }).compile();

    service = module.get(RetailAttendanceService);
  });

  it('returns a branch attendance summary using entitlement policy metadata', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC' },
      tenant: { id: 9 },
      entitlements: [
        {
          module: RetailModule.HR_ATTENDANCE,
          metadata: {
            hrAttendancePolicy: {
              shiftStartHour: 8,
              shiftEndHour: 17,
              gracePeriodMinutes: 15,
              overtimeThresholdHours: 9,
              timeZone: 'UTC',
            },
          },
        },
      ],
    });
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      {
        branchId: 3,
        userId: 11,
        role: BranchStaffRole.MANAGER,
        isActive: true,
        user: { id: 11, email: 'manager@test.com', displayName: 'Manager' },
      },
      {
        branchId: 3,
        userId: 12,
        role: BranchStaffRole.OPERATOR,
        isActive: true,
        user: { id: 12, email: 'operator@test.com', displayName: 'Operator' },
      },
    ]);
    const attendanceLogsQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          branchId: 3,
          userId: 11,
          checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          checkOutAt: null,
        },
        {
          id: 2,
          branchId: 3,
          userId: 12,
          checkInAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
          checkOutAt: new Date(Date.now() - 30 * 60 * 1000),
        },
      ]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );

    branchStaffAssignmentsRepository.findOne.mockResolvedValue({
      branchId: 3,
      userId: 11,
      role: BranchStaffRole.MANAGER,
      permissions: [],
      isActive: true,
    });

    const result = await service.getAttendanceSummary(
      {
        branchId: 3,
        windowHours: 24,
        limit: 25,
      },
      { id: 11, roles: ['B2B_BUYER'] },
    );

    expect(
      retailEntitlementsService.assertBranchHasModules,
    ).toHaveBeenCalledWith(3, [RetailModule.HR_ATTENDANCE]);
    expect(result.summary).toEqual(
      expect.objectContaining({
        branchId: 3,
        activeStaffCount: 2,
        checkedInStaffCount: 2,
        onDutyCount: 1,
        completedShiftCount: 1,
        permissions: {
          canOverrideAttendance: true,
        },
      }),
    );
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 11,
          attendanceStatus: 'ON_DUTY',
        }),
        expect.objectContaining({
          userId: 12,
          attendanceStatus: expect.any(String),
        }),
      ]),
    );
  });

  it('marks staff without a recent attendance log as absent', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC' },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      {
        branchId: 3,
        userId: 12,
        role: BranchStaffRole.OPERATOR,
        isActive: true,
        user: { id: 12, email: 'operator@test.com', displayName: 'Operator' },
      },
    ]);
    const attendanceLogsQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );

    branchStaffAssignmentsRepository.findOne.mockResolvedValue(null);

    const result = await service.getAttendanceSummary(
      { branchId: 3 },
      { id: 99, roles: ['B2B_BUYER'] },
    );

    expect(result.summary.absentCount).toBe(1);
    expect(result.summary.permissions.canOverrideAttendance).toBe(false);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        userId: 12,
        attendanceStatus: 'ABSENT',
      }),
    );
  });

  it('checks the current branch staff user into attendance', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC' },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchStaffAssignmentsRepository.findOne.mockResolvedValue({
      branchId: 3,
      userId: 11,
      role: BranchStaffRole.MANAGER,
      isActive: true,
      user: { id: 11, email: 'manager@test.com', displayName: 'Manager' },
    });
    hrAttendanceLogsRepository.findOne.mockResolvedValue(null);

    const result = await service.checkIn(
      {
        branchId: 3,
        source: 'MOBILE_APP',
        note: 'Morning shift',
      },
      { id: 11, email: 'manager@test.com', roles: ['POS_MANAGER'] },
    );

    expect(hrAttendanceLogsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 3,
        userId: 11,
        source: 'MOBILE_APP',
        note: 'Morning shift',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        branchId: 3,
        userId: 11,
        action: 'CHECKED_IN',
        checkOutAt: null,
      }),
    );
  });

  it('checks the current branch staff user out of attendance', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC' },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchStaffAssignmentsRepository.findOne.mockResolvedValue({
      branchId: 3,
      userId: 11,
      role: BranchStaffRole.MANAGER,
      isActive: true,
      user: { id: 11, email: 'manager@test.com', displayName: 'Manager' },
    });
    hrAttendanceLogsRepository.findOne.mockResolvedValue({
      id: 41,
      branchId: 3,
      userId: 11,
      checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      checkOutAt: null,
      source: 'RETAIL_OPS',
      note: null,
      metadata: null,
    });

    const result = await service.checkOut(
      {
        branchId: 3,
        note: 'Shift complete',
      },
      { id: 11, email: 'manager@test.com', roles: ['POS_MANAGER'] },
    );

    expect(hrAttendanceLogsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 41,
        note: 'Shift complete',
        checkOutAt: expect.any(Date),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        attendanceLogId: 41,
        branchId: 3,
        userId: 11,
        action: 'CHECKED_OUT',
        workedHours: expect.any(Number),
      }),
    );
  });

  it('allows a manager override check-in for another staff member', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC' },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchStaffAssignmentsRepository.findOne
      .mockResolvedValueOnce({
        branchId: 3,
        userId: 11,
        role: BranchStaffRole.MANAGER,
        permissions: [],
        isActive: true,
      })
      .mockResolvedValueOnce({
        branchId: 3,
        userId: 12,
        role: BranchStaffRole.OPERATOR,
        isActive: true,
        user: { id: 12, email: 'operator@test.com', displayName: 'Operator' },
      });
    hrAttendanceLogsRepository.findOne.mockResolvedValue(null);

    const result = await service.overrideCheckIn(
      {
        branchId: 3,
        targetUserId: 12,
        checkInAt: '2026-03-19T08:00:00.000Z',
        note: 'Backfilled missed check-in',
      },
      { id: 11, email: 'manager@test.com', roles: ['B2B_BUYER'] },
    );

    expect(result).toEqual(
      expect.objectContaining({
        userId: 12,
        action: 'OVERRIDE_CHECKED_IN',
      }),
    );
  });

  it('allows a manager override check-out for another staff member', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC' },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchStaffAssignmentsRepository.findOne
      .mockResolvedValueOnce({
        branchId: 3,
        userId: 11,
        role: BranchStaffRole.MANAGER,
        permissions: [],
        isActive: true,
      })
      .mockResolvedValueOnce({
        branchId: 3,
        userId: 12,
        role: BranchStaffRole.OPERATOR,
        isActive: true,
        user: { id: 12, email: 'operator@test.com', displayName: 'Operator' },
      });
    hrAttendanceLogsRepository.findOne.mockResolvedValue({
      id: 55,
      branchId: 3,
      userId: 12,
      checkInAt: new Date('2026-03-19T08:00:00.000Z'),
      checkOutAt: null,
      source: 'RETAIL_OPS',
      note: null,
      metadata: null,
    });

    const result = await service.overrideCheckOut(
      {
        branchId: 3,
        targetUserId: 12,
        checkOutAt: '2026-03-19T17:00:00.000Z',
        note: 'Forced close after missed check-out',
      },
      { id: 11, email: 'manager@test.com', roles: ['B2B_BUYER'] },
    );

    expect(result).toEqual(
      expect.objectContaining({
        attendanceLogId: 55,
        userId: 12,
        action: 'OVERRIDE_CHECKED_OUT',
        workedHours: 9,
      }),
    );
  });

  it('returns a tenant-level HR attendance network summary', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC', retailTenantId: 9 },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ', retailTenantId: 9, isActive: true },
      { id: 4, name: 'Bole', code: 'BOLE', retailTenantId: 9, isActive: true },
    ]);
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      {
        branchId: 3,
        userId: 11,
        role: BranchStaffRole.MANAGER,
        isActive: true,
        user: { id: 11, email: 'manager@test.com', displayName: 'Manager' },
      },
      {
        branchId: 4,
        userId: 12,
        role: BranchStaffRole.OPERATOR,
        isActive: true,
        user: { id: 12, email: 'operator@test.com', displayName: 'Operator' },
      },
    ]);
    const attendanceLogsQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          branchId: 3,
          userId: 11,
          checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          checkOutAt: null,
        },
      ]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );

    branchStaffAssignmentsRepository.findOne.mockResolvedValue({
      branchId: 3,
      userId: 11,
      role: BranchStaffRole.MANAGER,
      permissions: [],
      isActive: true,
    });

    const result = await service.getAttendanceNetworkSummary(
      {
        branchId: 3,
        limit: 10,
        windowHours: 24,
      },
      { id: 11, roles: ['B2B_BUYER'] },
    );

    expect(result).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 9,
        branchCount: 2,
        criticalBranchCount: 1,
        highBranchCount: 1,
        permissions: {
          canOverrideAttendance: true,
        },
        branches: expect.arrayContaining([
          expect.objectContaining({ branchId: 4, highestRisk: 'CRITICAL' }),
          expect.objectContaining({ branchId: 3, highestRisk: 'HIGH' }),
        ]),
      }),
    );
  });

  it('exports a tenant-level HR attendance network summary as CSV', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC', retailTenantId: null },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchStaffAssignmentsRepository.find.mockResolvedValue([]);
    const attendanceLogsQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );

    const csv = await service.exportAttendanceNetworkSummaryCsv({
      branchId: 3,
      limit: 10,
      windowHours: 24,
    });

    expect(csv).toContain('branchId,branchName,branchCode,highestRisk');
  });

  it('returns HR attendance exceptions for absent and late staff', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC', retailTenantId: null },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      {
        branchId: 3,
        userId: 11,
        role: BranchStaffRole.MANAGER,
        isActive: true,
        user: { id: 11, email: 'manager@test.com', displayName: 'Manager' },
      },
      {
        branchId: 3,
        userId: 12,
        role: BranchStaffRole.OPERATOR,
        isActive: true,
        user: { id: 12, email: 'operator@test.com', displayName: 'Operator' },
      },
    ]);
    const attendanceLogsQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          branchId: 3,
          userId: 11,
          checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          checkOutAt: new Date(Date.now() - 30 * 60 * 1000),
        },
      ]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );

    branchStaffAssignmentsRepository.findOne.mockResolvedValue({
      branchId: 3,
      userId: 22,
      role: BranchStaffRole.OPERATOR,
      permissions: [],
      isActive: true,
    });

    const result = await service.getAttendanceExceptions(
      {
        branchId: 3,
        queueType: RetailHrAttendanceExceptionQueueFilter.LATE,
        priority: RetailHrAttendanceExceptionPriorityFilter.CRITICAL,
        windowHours: 24,
      },
      { id: 22, roles: ['B2B_BUYER'] },
    );

    expect(result.summary).toEqual(
      expect.objectContaining({
        branchId: 3,
        totalExceptionCount: 2,
        filteredExceptionCount: 1,
        absentCount: 1,
        lateCount: 1,
        permissions: {
          canOverrideAttendance: false,
        },
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        userId: 11,
        queueType: RetailHrAttendanceExceptionQueueFilter.LATE,
        priority: RetailHrAttendanceExceptionPriorityFilter.CRITICAL,
        actions: expect.arrayContaining([
          expect.objectContaining({ type: 'VIEW_HR_ATTENDANCE_STAFF_DETAIL' }),
          expect.objectContaining({
            type: 'OVERRIDE_HR_ATTENDANCE',
            enabled: false,
          }),
        ]),
      }),
    ]);
  });

  it('exports HR attendance exceptions as CSV', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC', retailTenantId: null },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchStaffAssignmentsRepository.find.mockResolvedValue([]);
    const attendanceLogsQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );

    const csv = await service.exportAttendanceExceptionsCsv({
      branchId: 3,
      windowHours: 24,
    });

    expect(csv).toContain('branchId,windowHours,userId,displayName');
  });

  it('returns attendance detail for a branch staff member', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC', retailTenantId: null },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchStaffAssignmentsRepository.findOne
      .mockResolvedValueOnce({
        branchId: 3,
        userId: 11,
        role: BranchStaffRole.MANAGER,
        isActive: true,
        user: { id: 11, email: 'manager@test.com', displayName: 'Manager' },
      })
      .mockResolvedValueOnce({
        branchId: 3,
        userId: 22,
        role: BranchStaffRole.OPERATOR,
        permissions: [],
        isActive: true,
      });
    const attendanceLogsQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          branchId: 3,
          userId: 11,
          checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          checkOutAt: null,
          source: 'MOBILE_APP',
          note: 'Open shift',
          metadata: { override: true, overrideByUserId: 99 },
        },
      ]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );
    usersRepository.find.mockResolvedValue([
      { id: 99, email: 'auditor@test.com', displayName: 'Auditor' },
    ]);

    const result = await service.getAttendanceDetail(
      11,
      {
        branchId: 3,
        limit: 10,
        windowHours: 168,
      },
      { id: 22, roles: ['B2B_BUYER'] },
    );

    expect(result.summary).toEqual(
      expect.objectContaining({
        branchId: 3,
        userId: 11,
        currentStatus: 'ON_DUTY',
        shiftCount: 1,
        permissions: {
          canOverrideAttendance: false,
        },
      }),
    );
    expect(result.logs).toEqual([
      expect.objectContaining({
        attendanceLogId: 1,
        source: 'MOBILE_APP',
        overrideByUserId: 99,
        overrideByUserDisplayName: 'Auditor',
        overrideByUserEmail: 'auditor@test.com',
      }),
    ]);
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'VIEW_HR_ATTENDANCE' }),
        expect.objectContaining({ type: 'EXPORT_HR_ATTENDANCE_STAFF_DETAIL' }),
        expect.objectContaining({
          type: 'OVERRIDE_HR_ATTENDANCE_CHECK_OUT',
          enabled: false,
        }),
      ]),
    );
  });

  it('enables attendance override actions for manager actors on detail responses', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC', retailTenantId: null },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchStaffAssignmentsRepository.findOne
      .mockResolvedValueOnce({
        branchId: 3,
        userId: 12,
        role: BranchStaffRole.OPERATOR,
        isActive: true,
        user: { id: 12, email: 'operator@test.com', displayName: 'Operator' },
      })
      .mockResolvedValueOnce({
        branchId: 3,
        userId: 11,
        role: BranchStaffRole.MANAGER,
        permissions: [],
        isActive: true,
      });
    const attendanceLogsQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );
    usersRepository.find.mockResolvedValue([]);

    const result = await service.getAttendanceDetail(
      12,
      { branchId: 3, limit: 10, windowHours: 168 },
      { id: 11, roles: ['B2B_BUYER'] },
    );

    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'OVERRIDE_HR_ATTENDANCE_CHECK_IN',
          enabled: true,
        }),
      ]),
    );
    expect(result.summary.permissions.canOverrideAttendance).toBe(true);
  });

  it('exports attendance detail for a branch staff member as CSV', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC', retailTenantId: null },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchStaffAssignmentsRepository.findOne.mockResolvedValue({
      branchId: 3,
      userId: 11,
      role: BranchStaffRole.MANAGER,
      isActive: true,
      user: { id: 11, email: 'manager@test.com', displayName: 'Manager' },
    });
    const attendanceLogsQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );
    usersRepository.find.mockResolvedValue([]);

    const csv = await service.exportAttendanceDetailCsv(11, {
      branchId: 3,
      limit: 10,
      windowHours: 168,
    });

    expect(csv).toContain('branchId,userId,displayName,email,role,windowHours');
    expect(csv).toContain('policyShiftStartHour');
  });

  it('exports tenant-level HR attendance compliance rows across branches', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC', retailTenantId: 9 },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchesRepository.find.mockResolvedValue([
      {
        id: 3,
        name: 'HQ',
        code: 'HQ',
        retailTenantId: 9,
        timezone: 'UTC',
        isActive: true,
      },
      {
        id: 4,
        name: 'Bole',
        code: 'BOLE',
        retailTenantId: 9,
        timezone: 'UTC',
        isActive: true,
      },
    ]);
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      {
        branchId: 3,
        userId: 11,
        role: BranchStaffRole.MANAGER,
        isActive: true,
        user: { id: 11, email: 'manager@test.com', displayName: 'Manager' },
      },
      {
        branchId: 4,
        userId: 12,
        role: BranchStaffRole.OPERATOR,
        isActive: true,
        user: { id: 12, email: 'operator@test.com', displayName: 'Operator' },
      },
    ]);
    const attendanceLogsQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          branchId: 3,
          userId: 11,
          checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          checkOutAt: null,
          source: 'MOBILE_APP',
          note: 'Open shift',
          metadata: { override: true, overrideByUserId: 99 },
        },
      ]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );
    usersRepository.find.mockResolvedValue([
      { id: 99, email: 'auditor@test.com', displayName: 'Auditor' },
    ]);

    const csv = await service.exportAttendanceComplianceCsv({
      branchId: 3,
      windowHours: 168,
    });

    expect(csv).toContain('retailTenantId,anchorBranchId,branchId,branchName');
    expect(csv).toContain('manager@test.com');
    expect(csv).toContain('operator@test.com');
    expect(csv).toContain('ABSENT');
  });

  it('filters tenant-level HR attendance compliance exports by branch and staff ids', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC', retailTenantId: 9 },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchesRepository.find.mockResolvedValue([
      {
        id: 3,
        name: 'HQ',
        code: 'HQ',
        retailTenantId: 9,
        timezone: 'UTC',
        isActive: true,
      },
      {
        id: 4,
        name: 'Bole',
        code: 'BOLE',
        retailTenantId: 9,
        timezone: 'UTC',
        isActive: true,
      },
    ]);
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      {
        branchId: 4,
        userId: 12,
        role: BranchStaffRole.OPERATOR,
        isActive: true,
        user: { id: 12, email: 'operator@test.com', displayName: 'Operator' },
      },
    ]);
    const attendanceLogsQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );
    usersRepository.find.mockResolvedValue([]);

    const csv = await service.exportAttendanceComplianceCsv({
      branchId: 3,
      windowHours: 168,
      branchIds: [4],
      userIds: [12],
    });

    expect(branchStaffAssignmentsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId: expect.any(Object),
          userId: expect.any(Object),
          isActive: true,
        }),
      }),
    );
    expect(csv).toContain('operator@test.com');
    expect(csv).not.toContain('manager@test.com');
  });

  it('filters tenant-level HR attendance compliance exports by status and exception queue type', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC', retailTenantId: 9 },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchesRepository.find.mockResolvedValue([
      {
        id: 3,
        name: 'HQ',
        code: 'HQ',
        retailTenantId: 9,
        timezone: 'UTC',
        isActive: true,
      },
      {
        id: 4,
        name: 'Bole',
        code: 'BOLE',
        retailTenantId: 9,
        timezone: 'UTC',
        isActive: true,
      },
    ]);
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      {
        branchId: 3,
        userId: 11,
        role: BranchStaffRole.MANAGER,
        isActive: true,
        user: { id: 11, email: 'manager@test.com', displayName: 'Manager' },
      },
      {
        branchId: 4,
        userId: 12,
        role: BranchStaffRole.OPERATOR,
        isActive: true,
        user: { id: 12, email: 'operator@test.com', displayName: 'Operator' },
      },
    ]);
    const attendanceLogsQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          branchId: 3,
          userId: 11,
          checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          checkOutAt: null,
          source: 'MOBILE_APP',
          note: 'Open shift',
          metadata: {},
        },
      ]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );
    usersRepository.find.mockResolvedValue([]);

    const csv = await service.exportAttendanceComplianceCsv({
      branchId: 3,
      windowHours: 168,
      statuses: [RetailHrAttendanceComplianceStatusFilter.ABSENT],
      queueTypes: [RetailHrAttendanceExceptionQueueFilter.ABSENT],
      priorities: [RetailHrAttendanceExceptionPriorityFilter.CRITICAL],
    });

    expect(csv).toContain('operator@test.com');
    expect(csv).toContain('ABSENT');
    expect(csv).not.toContain('manager@test.com');
    expect(csv).not.toContain('ON_DUTY');
  });

  it('filters tenant-level HR attendance compliance exports by exception priority', async () => {
    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC', retailTenantId: 9 },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchesRepository.find.mockResolvedValue([
      {
        id: 3,
        name: 'HQ',
        code: 'HQ',
        retailTenantId: 9,
        timezone: 'UTC',
        isActive: true,
      },
      {
        id: 4,
        name: 'Bole',
        code: 'BOLE',
        retailTenantId: 9,
        timezone: 'UTC',
        isActive: true,
      },
    ]);
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      {
        branchId: 3,
        userId: 11,
        role: BranchStaffRole.MANAGER,
        isActive: true,
        user: { id: 11, email: 'manager@test.com', displayName: 'Manager' },
      },
      {
        branchId: 4,
        userId: 12,
        role: BranchStaffRole.OPERATOR,
        isActive: true,
        user: { id: 12, email: 'operator@test.com', displayName: 'Operator' },
      },
    ]);
    const attendanceLogsQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          branchId: 3,
          userId: 11,
          checkInAt: new Date(Date.now() - 30 * 60 * 1000),
          checkOutAt: null,
          source: 'MOBILE_APP',
          note: 'Open shift',
          metadata: {},
        },
        {
          id: 2,
          branchId: 4,
          userId: 12,
          checkInAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
          checkOutAt: null,
          source: 'MOBILE_APP',
          note: 'Extended shift',
          metadata: {},
        },
      ]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );
    usersRepository.find.mockResolvedValue([]);

    const csv = await service.exportAttendanceComplianceCsv({
      branchId: 3,
      windowHours: 168,
      queueTypes: [RetailHrAttendanceExceptionQueueFilter.OVERTIME],
      priorities: [RetailHrAttendanceExceptionPriorityFilter.CRITICAL],
    });

    expect(csv).toContain('operator@test.com');
    expect(csv).toContain('OVERTIME');
    expect(csv).toContain('CRITICAL');
    expect(csv).not.toContain('manager@test.com');
  });

  it('returns tenant-level HR attendance compliance aggregates for HQ dashboards', async () => {
    const completedShiftCheckInAt = new Date();
    completedShiftCheckInAt.setUTCDate(
      completedShiftCheckInAt.getUTCDate() - 1,
    );
    completedShiftCheckInAt.setUTCHours(8, 0, 0, 0);

    const completedShiftCheckOutAt = new Date(completedShiftCheckInAt);
    completedShiftCheckOutAt.setUTCHours(15, 0, 0, 0);

    retailEntitlementsService.assertBranchHasModules.mockResolvedValue({
      branch: { id: 3, timezone: 'UTC', retailTenantId: 9 },
      tenant: { id: 9 },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE, metadata: null }],
    });
    branchesRepository.find.mockResolvedValue([
      {
        id: 3,
        name: 'HQ',
        code: 'HQ',
        retailTenantId: 9,
        timezone: 'UTC',
        isActive: true,
      },
      {
        id: 4,
        name: 'Bole',
        code: 'BOLE',
        retailTenantId: 9,
        timezone: 'UTC',
        isActive: true,
      },
    ]);
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      {
        branchId: 3,
        userId: 11,
        role: BranchStaffRole.MANAGER,
        isActive: true,
        user: { id: 11, email: 'manager@test.com', displayName: 'Manager' },
      },
      {
        branchId: 4,
        userId: 12,
        role: BranchStaffRole.OPERATOR,
        isActive: true,
        user: { id: 12, email: 'operator@test.com', displayName: 'Operator' },
      },
    ]);
    branchStaffAssignmentsRepository.findOne.mockResolvedValue({
      branchId: 3,
      userId: 11,
      role: BranchStaffRole.MANAGER,
      permissions: [],
      isActive: true,
    });
    const attendanceLogsQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          branchId: 3,
          userId: 11,
          checkInAt: completedShiftCheckInAt,
          checkOutAt: completedShiftCheckOutAt,
          source: 'MOBILE_APP',
          note: 'Completed shift',
          metadata: {},
        },
      ]),
    };
    hrAttendanceLogsRepository.createQueryBuilder.mockReturnValue(
      attendanceLogsQb,
    );
    usersRepository.find.mockResolvedValue([]);

    const result = await service.getAttendanceComplianceSummary(
      {
        branchId: 3,
        windowHours: 168,
      },
      { id: 11, roles: ['B2B_BUYER'] },
    );

    expect(result.summary).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 9,
        branchCount: 2,
        filteredBranchCount: 2,
        totalStaffCount: 2,
        filteredStaffCount: 2,
        totalExceptionCount: 1,
        filteredExceptionCount: 1,
        permissions: {
          canOverrideAttendance: true,
        },
      }),
    );
    expect(result.statusCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'ABSENT', count: 1 }),
        expect.objectContaining({ key: 'COMPLETED', count: 1 }),
      ]),
    );
    expect(result.queueTypeCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'ABSENT', count: 1 }),
        expect.objectContaining({ key: 'LATE', count: 0 }),
      ]),
    );
    expect(result.priorityCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'CRITICAL', count: 1 }),
      ]),
    );
    expect(result.branches).toEqual([
      expect.objectContaining({
        branchId: 4,
        branchName: 'Bole',
        filteredStaffCount: 1,
        filteredExceptionCount: 1,
        statusCounts: expect.arrayContaining([
          expect.objectContaining({ key: 'ABSENT', count: 1 }),
        ]),
        queueTypeCounts: expect.arrayContaining([
          expect.objectContaining({ key: 'ABSENT', count: 1 }),
        ]),
      }),
      expect.objectContaining({
        branchId: 3,
        branchName: 'HQ',
        filteredStaffCount: 1,
        filteredExceptionCount: 0,
        statusCounts: expect.arrayContaining([
          expect.objectContaining({ key: 'COMPLETED', count: 1 }),
        ]),
      }),
    ]);
    expect(result.topStaffExceptions).toEqual([
      expect.objectContaining({
        branchId: 4,
        branchName: 'Bole',
        userId: 12,
        email: 'operator@test.com',
        currentStatus: 'ABSENT',
        queueType: RetailHrAttendanceExceptionQueueFilter.ABSENT,
        priority: RetailHrAttendanceExceptionPriorityFilter.CRITICAL,
      }),
    ]);
  });
});
