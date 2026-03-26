import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { RetailAttendanceService } from '../src/retail/retail-attendance.service';
import { RetailModulesGuard } from '../src/retail/retail-modules.guard';
import { RetailOpsController } from '../src/retail/retail-ops.controller';
import { RetailOpsService } from '../src/retail/retail-ops.service';

describe('RetailOpsController HR attendance (e2e)', () => {
  let app: INestApplication;
  let retailAttendanceService: {
    getAttendanceSummary: jest.Mock;
    getAttendanceDetail: jest.Mock;
    exportAttendanceDetailCsv: jest.Mock;
    getAttendanceExceptions: jest.Mock;
    exportAttendanceExceptionsCsv: jest.Mock;
    checkIn: jest.Mock;
    checkOut: jest.Mock;
    overrideCheckIn: jest.Mock;
    overrideCheckOut: jest.Mock;
    getAttendanceNetworkSummary: jest.Mock;
    exportAttendanceNetworkSummaryCsv: jest.Mock;
    getAttendanceComplianceSummary: jest.Mock;
    exportAttendanceComplianceCsv: jest.Mock;
  };

  beforeAll(async () => {
    retailAttendanceService = {
      getAttendanceSummary: jest.fn().mockResolvedValue({
        summary: {
          branchId: 3,
          windowHours: 24,
          activeStaffCount: 2,
          checkedInStaffCount: 1,
          onDutyCount: 1,
          absentCount: 1,
          completedShiftCount: 0,
          lateCheckInCount: 0,
          overtimeActiveCount: 0,
          attendanceRate: 50,
          averageWorkedHours: 2,
          policy: {
            shiftStartHour: 8,
            shiftEndHour: 17,
            gracePeriodMinutes: 15,
            overtimeThresholdHours: 9,
            timeZone: 'UTC',
          },
          permissions: {
            canOverrideAttendance: false,
          },
        },
        items: [
          {
            userId: 11,
            displayName: 'Manager',
            email: 'manager@test.com',
            role: 'MANAGER',
            attendanceStatus: 'ON_DUTY',
            latestCheckInAt: '2026-03-19T08:00:00.000Z',
            latestCheckOutAt: null,
            workedHours: 2,
            lateMinutes: 0,
            overtimeHours: 0,
          },
        ],
      }),
      getAttendanceDetail: jest.fn().mockResolvedValue({
        summary: {
          branchId: 3,
          userId: 11,
          displayName: 'Manager',
          email: 'manager@test.com',
          role: 'MANAGER',
          windowHours: 168,
          currentStatus: 'ON_DUTY',
          latestCheckInAt: '2026-03-19T08:00:00.000Z',
          latestCheckOutAt: null,
          workedHours: 2,
          lateMinutes: 0,
          overtimeHours: 0,
          shiftCount: 1,
          openShiftCount: 1,
          lastActivityAt: '2026-03-19T08:00:00.000Z',
          policy: {
            shiftStartHour: 8,
            shiftEndHour: 17,
            gracePeriodMinutes: 15,
            overtimeThresholdHours: 9,
            timeZone: 'UTC',
          },
          permissions: {
            canOverrideAttendance: false,
          },
        },
        actions: [],
        logs: [
          {
            attendanceLogId: 1,
            status: 'ON_DUTY',
            checkInAt: '2026-03-19T08:00:00.000Z',
            checkOutAt: null,
            workedHours: 2,
            lateMinutes: 0,
            overtimeHours: 0,
            source: 'MOBILE_APP',
            note: 'Open shift',
            isOverride: false,
            overrideByUserId: null,
            overrideByUserDisplayName: null,
            overrideByUserEmail: null,
          },
        ],
      }),
      exportAttendanceDetailCsv: jest
        .fn()
        .mockResolvedValue('branchId,userId\n3,11'),
      getAttendanceExceptions: jest.fn().mockResolvedValue({
        summary: {
          branchId: 3,
          windowHours: 24,
          totalExceptionCount: 2,
          filteredExceptionCount: 1,
          absentCount: 1,
          lateCount: 1,
          overtimeCount: 0,
          criticalCount: 1,
          highCount: 0,
          normalCount: 0,
          lastActivityAt: null,
          permissions: {
            canOverrideAttendance: false,
          },
        },
        actions: [],
        items: [
          {
            userId: 11,
            displayName: 'Cashier 1',
            email: 'cashier1@test.com',
            role: 'OPERATOR',
            queueType: 'ABSENT',
            priority: 'CRITICAL',
            priorityReason:
              'No recent attendance activity was found for this active branch staff member.',
            latestCheckInAt: null,
            latestCheckOutAt: null,
            workedHours: null,
            lateMinutes: 0,
            overtimeHours: 0,
            actions: [
              {
                type: 'VIEW_HR_ATTENDANCE_STAFF_DETAIL',
                method: 'GET',
                path: '/retail/v1/ops/hr-attendance/staff/11?branchId=3&windowHours=24',
                body: null,
                enabled: true,
              },
            ],
          },
        ],
      }),
      exportAttendanceExceptionsCsv: jest
        .fn()
        .mockResolvedValue('branchId,userId,queueType\n3,11,ABSENT'),
      checkIn: jest.fn().mockResolvedValue({
        attendanceLogId: 91,
        branchId: 3,
        userId: 18,
        displayName: 'Buyer',
        email: 'buyer@test.com',
        role: 'OPERATOR',
        action: 'CHECKED_IN',
        checkInAt: '2026-03-19T08:00:00.000Z',
        checkOutAt: null,
        workedHours: null,
        source: 'MOBILE_APP',
        note: 'Morning shift',
      }),
      checkOut: jest.fn().mockResolvedValue({
        attendanceLogId: 91,
        branchId: 3,
        userId: 18,
        displayName: 'Buyer',
        email: 'buyer@test.com',
        role: 'OPERATOR',
        action: 'CHECKED_OUT',
        checkInAt: '2026-03-19T08:00:00.000Z',
        checkOutAt: '2026-03-19T16:00:00.000Z',
        workedHours: 8,
        source: 'MOBILE_APP',
        note: 'Shift complete',
      }),
      overrideCheckIn: jest.fn().mockResolvedValue({
        attendanceLogId: 92,
        branchId: 3,
        userId: 27,
        displayName: 'Operator',
        email: 'operator@test.com',
        role: 'OPERATOR',
        action: 'OVERRIDE_CHECKED_IN',
        checkInAt: '2026-03-19T08:00:00.000Z',
        checkOutAt: null,
        workedHours: null,
        source: 'MANAGER_OVERRIDE',
        note: 'Backfilled missed check-in',
      }),
      overrideCheckOut: jest.fn().mockResolvedValue({
        attendanceLogId: 92,
        branchId: 3,
        userId: 27,
        displayName: 'Operator',
        email: 'operator@test.com',
        role: 'OPERATOR',
        action: 'OVERRIDE_CHECKED_OUT',
        checkInAt: '2026-03-19T08:00:00.000Z',
        checkOutAt: '2026-03-19T17:00:00.000Z',
        workedHours: 9,
        source: 'MANAGER_OVERRIDE',
        note: 'Forced close after missed check-out',
      }),
      getAttendanceNetworkSummary: jest.fn().mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 9,
        branchCount: 2,
        windowHours: 24,
        activeStaffCount: 2,
        checkedInStaffCount: 1,
        onDutyCount: 1,
        absentCount: 1,
        lateCheckInCount: 0,
        overtimeActiveCount: 0,
        averageAttendanceRate: 50,
        criticalBranchCount: 1,
        highBranchCount: 0,
        normalBranchCount: 1,
        alerts: [],
        branches: [
          {
            branchId: 4,
            branchName: 'Bole',
            branchCode: 'BOLE',
            highestRisk: 'CRITICAL',
            highestRiskReason:
              'At least one active branch staff member has no recent attendance activity.',
            activeStaffCount: 1,
            checkedInStaffCount: 0,
            onDutyCount: 0,
            absentCount: 1,
            lateCheckInCount: 0,
            overtimeActiveCount: 0,
            attendanceRate: 0,
            averageWorkedHours: 0,
            lastActivityAt: null,
            actions: [],
          },
        ],
      }),
      exportAttendanceNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName\n4,"Bole"'),
      getAttendanceComplianceSummary: jest.fn().mockResolvedValue({
        summary: {
          anchorBranchId: 3,
          retailTenantId: 9,
          branchCount: 2,
          filteredBranchCount: 1,
          windowHours: 168,
          totalStaffCount: 4,
          filteredStaffCount: 2,
          totalExceptionCount: 3,
          filteredExceptionCount: 1,
          lastActivityAt: '2026-03-19T08:00:00.000Z',
          permissions: {
            canOverrideAttendance: false,
          },
        },
        statusCounts: [{ key: 'ABSENT', count: 1 }],
        queueTypeCounts: [{ key: 'ABSENT', count: 1 }],
        priorityCounts: [{ key: 'CRITICAL', count: 1 }],
        branches: [
          {
            branchId: 4,
            branchName: 'Bole',
            branchCode: 'BOLE',
            filteredStaffCount: 2,
            filteredExceptionCount: 1,
            lastActivityAt: '2026-03-19T08:00:00.000Z',
            statusCounts: [{ key: 'ABSENT', count: 1 }],
            queueTypeCounts: [{ key: 'ABSENT', count: 1 }],
            priorityCounts: [{ key: 'CRITICAL', count: 1 }],
          },
        ],
        topStaffExceptions: [
          {
            branchId: 4,
            branchName: 'Bole',
            branchCode: 'BOLE',
            userId: 18,
            displayName: 'Operator',
            email: 'operator@test.com',
            role: 'OPERATOR',
            currentStatus: 'ABSENT',
            queueType: 'ABSENT',
            priority: 'CRITICAL',
            priorityReason: 'No recent attendance activity was found.',
            latestCheckInAt: null,
            latestCheckOutAt: null,
            workedHours: null,
            lateMinutes: 0,
            overtimeHours: 0,
          },
        ],
      }),
      getAttendanceNetworkSummary: jest.fn().mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 9,
        branchCount: 2,
        windowHours: 24,
        activeStaffCount: 5,
        checkedInStaffCount: 3,
        onDutyCount: 3,
        absentCount: 1,
        lateCheckInCount: 1,
        overtimeActiveCount: 0,
        averageAttendanceRate: 60,
        criticalBranchCount: 1,
        highBranchCount: 1,
        normalBranchCount: 0,
        permissions: {
          canOverrideAttendance: false,
        },
        alerts: [],
        branches: [
          {
            branchId: 4,
            branchName: 'Bole',
            branchCode: 'BOLE',
            highestRisk: 'CRITICAL',
            highestRiskReason: 'Absent coverage is elevated.',
            activeStaffCount: 3,
            checkedInStaffCount: 1,
            onDutyCount: 1,
            absentCount: 1,
            lateCheckInCount: 1,
            overtimeActiveCount: 0,
            attendanceRate: 33.33,
            averageWorkedHours: 2,
            lastActivityAt: '2026-03-19T08:00:00.000Z',
            actions: [],
          },
        ],
      }),
      exportAttendanceComplianceCsv: jest
        .fn()
        .mockResolvedValue(
          'retailTenantId,anchorBranchId,branchId,branchName,userId\n9,3,3,"HQ",11',
        ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RetailOpsController],
      providers: [
        {
          provide: RetailOpsService,
          useValue: {},
        },
        {
          provide: RetailAttendanceService,
          useValue: retailAttendanceService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 18, email: 'buyer@test.com', roles: ['B2B_BUYER'] };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RetailModulesGuard)
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

  it('returns a branch HR attendance summary', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/hr-attendance')
      .query({ branchId: 3, windowHours: 24, limit: 20 })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          branchId: 3,
          activeStaffCount: 2,
          checkedInStaffCount: 1,
          permissions: expect.objectContaining({
            canOverrideAttendance: false,
          }),
        }),
      }),
    );
    expect(retailAttendanceService.getAttendanceSummary).toHaveBeenCalledWith(
      {
        branchId: 3,
        windowHours: 24,
        limit: 20,
      },
      {
        id: 18,
        email: 'buyer@test.com',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('returns branch HR attendance detail for a staff member', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/hr-attendance/staff/11')
      .query({ branchId: 3, limit: 10, windowHours: 168 })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          branchId: 3,
          userId: 11,
          currentStatus: 'ON_DUTY',
          permissions: expect.objectContaining({
            canOverrideAttendance: false,
          }),
        }),
      }),
    );
    expect(retailAttendanceService.getAttendanceDetail).toHaveBeenCalledWith(
      11,
      {
        branchId: 3,
        limit: 10,
        windowHours: 168,
      },
      {
        id: 18,
        email: 'buyer@test.com',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('exports branch HR attendance detail for a staff member as CSV', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/hr-attendance/staff/11/export')
      .query({ branchId: 3, limit: 10, windowHours: 168 })
      .expect(200);

    expect(response.text).toContain('branchId,userId');
    expect(
      retailAttendanceService.exportAttendanceDetailCsv,
    ).toHaveBeenCalledWith(
      11,
      {
        branchId: 3,
        limit: 10,
        windowHours: 168,
      },
      {
        id: 18,
        email: 'buyer@test.com',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('returns a branch HR attendance exception queue', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/hr-attendance/exceptions')
      .query({
        branchId: 3,
        queueType: 'ABSENT',
        priority: 'CRITICAL',
        windowHours: 24,
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          branchId: 3,
          filteredExceptionCount: 1,
          permissions: expect.objectContaining({
            canOverrideAttendance: false,
          }),
        }),
      }),
    );
    expect(
      retailAttendanceService.getAttendanceExceptions,
    ).toHaveBeenCalledWith(
      {
        branchId: 3,
        queueType: 'ABSENT',
        priority: 'CRITICAL',
        windowHours: 24,
      },
      {
        id: 18,
        email: 'buyer@test.com',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('exports a branch HR attendance exception queue as CSV', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/hr-attendance/exceptions/export')
      .query({
        branchId: 3,
        queueType: 'ABSENT',
        priority: 'CRITICAL',
        windowHours: 24,
      })
      .expect(200);

    expect(response.text).toContain('branchId,userId,queueType');
    expect(
      retailAttendanceService.exportAttendanceExceptionsCsv,
    ).toHaveBeenCalledWith(
      {
        branchId: 3,
        queueType: 'ABSENT',
        priority: 'CRITICAL',
        windowHours: 24,
      },
      {
        id: 18,
        email: 'buyer@test.com',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('rejects HR attendance requests without a branchId query', async () => {
    await request(app.getHttpServer())
      .get('/api/retail/v1/ops/hr-attendance')
      .expect(400);
  });

  it('checks the current branch staff user into attendance', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/retail/v1/ops/hr-attendance/check-in')
      .send({ branchId: 3, source: 'MOBILE_APP', note: 'Morning shift' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        attendanceLogId: 91,
        branchId: 3,
        action: 'CHECKED_IN',
      }),
    );
    expect(retailAttendanceService.checkIn).toHaveBeenCalledWith(
      { branchId: 3, source: 'MOBILE_APP', note: 'Morning shift' },
      {
        id: 18,
        email: 'buyer@test.com',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('checks the current branch staff user out of attendance', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/retail/v1/ops/hr-attendance/check-out')
      .send({ branchId: 3, note: 'Shift complete' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        attendanceLogId: 91,
        branchId: 3,
        action: 'CHECKED_OUT',
        workedHours: 8,
      }),
    );
    expect(retailAttendanceService.checkOut).toHaveBeenCalledWith(
      { branchId: 3, note: 'Shift complete' },
      {
        id: 18,
        email: 'buyer@test.com',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('rejects HR attendance check-in without a branchId body value', async () => {
    await request(app.getHttpServer())
      .post('/api/retail/v1/ops/hr-attendance/check-in')
      .send({ note: 'Morning shift' })
      .expect(400);
  });

  it('allows an HR attendance override check-in for a target staff member', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/retail/v1/ops/hr-attendance/overrides/check-in')
      .send({
        branchId: 3,
        targetUserId: 27,
        checkInAt: '2026-03-19T08:00:00.000Z',
        note: 'Backfilled missed check-in',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        attendanceLogId: 92,
        branchId: 3,
        userId: 27,
        action: 'OVERRIDE_CHECKED_IN',
      }),
    );
  });

  it('allows an HR attendance override check-out for a target staff member', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/retail/v1/ops/hr-attendance/overrides/check-out')
      .send({
        branchId: 3,
        targetUserId: 27,
        checkOutAt: '2026-03-19T17:00:00.000Z',
        note: 'Forced close after missed check-out',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        attendanceLogId: 92,
        branchId: 3,
        userId: 27,
        action: 'OVERRIDE_CHECKED_OUT',
      }),
    );
  });

  it('returns an HR attendance network summary for HQ', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/hr-attendance/network-summary')
      .query({ branchId: 3, limit: 10, risk: 'CRITICAL', windowHours: 24 })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        criticalBranchCount: 1,
        permissions: expect.objectContaining({
          canOverrideAttendance: false,
        }),
      }),
    );
    expect(
      retailAttendanceService.getAttendanceNetworkSummary,
    ).toHaveBeenCalledWith(
      {
        branchId: 3,
        limit: 10,
        risk: 'CRITICAL',
        windowHours: 24,
      },
      {
        id: 18,
        email: 'buyer@test.com',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('exports an HR attendance network summary as CSV', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/hr-attendance/network-summary/export')
      .query({ branchId: 3, limit: 10, risk: 'CRITICAL', windowHours: 24 })
      .expect(200);

    expect(response.text).toContain('branchId,branchName');
  });

  it('exports tenant HR attendance compliance rows for HQ review as CSV', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/hr-attendance/compliance-export')
      .query({
        branchId: 3,
        windowHours: 168,
        branchIds: '3,4',
        userIds: '11,18',
        statuses: 'ABSENT,LATE',
        queueTypes: 'ABSENT',
        priorities: 'CRITICAL',
      })
      .expect(200);

    expect(response.text).toContain(
      'retailTenantId,anchorBranchId,branchId,branchName,userId',
    );
    expect(
      retailAttendanceService.exportAttendanceComplianceCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      windowHours: 168,
      branchIds: [3, 4],
      userIds: [11, 18],
      statuses: ['ABSENT', 'LATE'],
      queueTypes: ['ABSENT'],
      priorities: ['CRITICAL'],
    });
  });

  it('returns tenant HR attendance compliance aggregates for HQ review', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/hr-attendance/compliance-summary')
      .query({
        branchId: 3,
        windowHours: 168,
        branchIds: '3,4',
        userIds: '11,18',
        statuses: 'ABSENT,LATE',
        queueTypes: 'ABSENT',
        priorities: 'CRITICAL',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          anchorBranchId: 3,
          filteredExceptionCount: 1,
          permissions: expect.objectContaining({
            canOverrideAttendance: false,
          }),
        }),
        branches: expect.arrayContaining([
          expect.objectContaining({
            branchId: 4,
            filteredExceptionCount: 1,
          }),
        ]),
        topStaffExceptions: expect.arrayContaining([
          expect.objectContaining({
            branchId: 4,
            queueType: 'ABSENT',
            priority: 'CRITICAL',
          }),
        ]),
      }),
    );
    expect(
      retailAttendanceService.getAttendanceComplianceSummary,
    ).toHaveBeenCalledWith(
      {
        branchId: 3,
        windowHours: 168,
        branchIds: [3, 4],
        userIds: [11, 18],
        statuses: ['ABSENT', 'LATE'],
        queueTypes: ['ABSENT'],
        priorities: ['CRITICAL'],
      },
      {
        id: 18,
        email: 'buyer@test.com',
        roles: ['B2B_BUYER'],
      },
    );
  });
});
