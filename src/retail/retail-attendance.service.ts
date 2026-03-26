import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from '../branch-staff/entities/branch-staff-assignment.entity';
import { UserRole } from '../auth/roles.enum';
import { Branch } from '../branches/entities/branch.entity';
import { User } from '../users/entities/user.entity';
import { RetailEntitlementsService } from './retail-entitlements.service';
import { RetailModule } from './entities/tenant-module-entitlement.entity';
import { HrAttendanceLog } from './entities/hr-attendance-log.entity';
import { MutateRetailHrAttendanceDto } from './dto/mutate-retail-hr-attendance.dto';
import {
  OverrideRetailHrAttendanceCheckInDto,
  OverrideRetailHrAttendanceCheckOutDto,
} from './dto/override-retail-hr-attendance.dto';
import { RetailHrAttendanceQueryDto } from './dto/retail-hr-attendance-query.dto';
import {
  RetailHrAttendanceItemResponseDto,
  RetailHrAttendanceMutationResponseDto,
  RetailHrAttendancePolicyResponseDto,
  RetailHrAttendanceResponseDto,
  RetailHrAttendanceSummaryResponseDto,
} from './dto/retail-hr-attendance-response.dto';
import {
  RetailHrAttendanceNetworkActionResponseDto,
  RetailHrAttendanceNetworkAlertResponseDto,
  RetailHrAttendanceNetworkBranchResponseDto,
  RetailHrAttendanceNetworkSummaryResponseDto,
} from './dto/retail-hr-attendance-network-summary-response.dto';
import {
  RetailHrAttendanceNetworkRiskFilter,
  RetailHrAttendanceNetworkSummaryQueryDto,
} from './dto/retail-hr-attendance-network-summary-query.dto';
import {
  RetailHrAttendanceExceptionPriorityFilter,
  RetailHrAttendanceExceptionQueueFilter,
  RetailHrAttendanceExceptionsQueryDto,
} from './dto/retail-hr-attendance-exceptions-query.dto';
import {
  RetailHrAttendanceExceptionActionResponseDto,
  RetailHrAttendanceExceptionItemResponseDto,
  RetailHrAttendanceExceptionsResponseDto,
} from './dto/retail-hr-attendance-exceptions-response.dto';
import {
  RetailHrAttendanceComplianceExportQueryDto,
  RetailHrAttendanceComplianceStatusFilter,
} from './dto/retail-hr-attendance-compliance-export-query.dto';
import {
  RetailHrAttendanceComplianceBranchSummaryResponseDto,
  RetailHrAttendanceComplianceCountEntryResponseDto,
  RetailHrAttendanceComplianceSummaryResponseDto,
  RetailHrAttendanceComplianceTopStaffExceptionResponseDto,
} from './dto/retail-hr-attendance-compliance-summary-response.dto';
import { RetailHrAttendanceDetailQueryDto } from './dto/retail-hr-attendance-detail-query.dto';
import {
  RetailHrAttendanceDetailActionResponseDto,
  RetailHrAttendanceDetailLogResponseDto,
  RetailHrAttendanceDetailResponseDto,
} from './dto/retail-hr-attendance-detail-response.dto';

type HrAttendancePolicy = {
  shiftStartHour: number;
  shiftEndHour: number;
  gracePeriodMinutes: number;
  overtimeThresholdHours: number;
  timeZone: string;
};

type AttendanceActorContext = {
  id?: number | null;
  email?: string | null;
  roles?: string[];
};

type AttendanceComplianceClassification = {
  queueType: RetailHrAttendanceExceptionQueueFilter;
  priority: RetailHrAttendanceExceptionPriorityFilter;
  priorityReason: string;
};

type AttendanceComplianceRow = {
  branch: Branch;
  assignment: BranchStaffAssignment;
  currentItem: RetailHrAttendanceItemResponseDto;
  exception: AttendanceComplianceClassification | null;
  detailLogs: RetailHrAttendanceDetailLogResponseDto[];
  lastActivityAt: Date | null;
  policy: HrAttendancePolicy;
};

@Injectable()
export class RetailAttendanceService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(BranchStaffAssignment)
    private readonly branchStaffAssignmentsRepository: Repository<BranchStaffAssignment>,
    @InjectRepository(HrAttendanceLog)
    private readonly hrAttendanceLogsRepository: Repository<HrAttendanceLog>,
    private readonly retailEntitlementsService: RetailEntitlementsService,
  ) {}

  async getAttendanceSummary(
    query: RetailHrAttendanceQueryDto,
    actor: AttendanceActorContext = {},
  ): Promise<RetailHrAttendanceResponseDto> {
    const access = await this.retailEntitlementsService.assertBranchHasModules(
      query.branchId,
      [RetailModule.HR_ATTENDANCE],
    );
    const entitlement = access.entitlements.find(
      (entry) => entry.module === RetailModule.HR_ATTENDANCE,
    );

    const windowHours = Math.min(Math.max(query.windowHours ?? 24, 1), 168);
    const itemLimit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const policy = this.resolvePolicy(
      access.branch.timezone ?? null,
      entitlement?.metadata?.hrAttendancePolicy ?? null,
    );
    const canOverride = await this.canOverrideAttendance(
      query.branchId,
      actor.id ?? null,
      actor.roles ?? [],
    );
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const now = new Date();

    const [assignments, logs] = await Promise.all([
      this.branchStaffAssignmentsRepository.find({
        where: { branchId: query.branchId, isActive: true },
        relations: { user: true },
      }),
      this.hrAttendanceLogsRepository
        .createQueryBuilder('attendance')
        .leftJoinAndSelect('attendance.user', 'user')
        .where('attendance.branchId = :branchId', { branchId: query.branchId })
        .andWhere(
          '(attendance.checkInAt >= :windowStart OR attendance.checkOutAt IS NULL)',
          {
            windowStart: windowStart.toISOString(),
          },
        )
        .orderBy('attendance.checkInAt', 'DESC')
        .addOrderBy('attendance.id', 'DESC')
        .getMany(),
    ]);

    const latestLogByUserId = new Map<number, HrAttendanceLog>();
    for (const log of logs) {
      if (!latestLogByUserId.has(log.userId)) {
        latestLogByUserId.set(log.userId, log);
      }
    }

    const items = assignments
      .map((assignment) =>
        this.mapAttendanceItem(
          assignment,
          latestLogByUserId.get(assignment.userId) ?? null,
          policy,
          now,
          windowStart,
        ),
      )
      .sort((left, right) => {
        const severity = {
          OVERTIME: 0,
          ON_DUTY: 1,
          LATE: 2,
          COMPLETED: 3,
          ABSENT: 4,
        } as Record<string, number>;

        const severityDelta =
          (severity[left.attendanceStatus] ?? 99) -
          (severity[right.attendanceStatus] ?? 99);
        if (severityDelta !== 0) {
          return severityDelta;
        }

        const leftTime = left.latestCheckInAt
          ? new Date(left.latestCheckInAt).getTime()
          : 0;
        const rightTime = right.latestCheckInAt
          ? new Date(right.latestCheckInAt).getTime()
          : 0;
        if (leftTime !== rightTime) {
          return rightTime - leftTime;
        }

        return (left.displayName ?? left.email).localeCompare(
          right.displayName ?? right.email,
        );
      })
      .slice(0, itemLimit);

    const activeStaffCount = assignments.length;
    const checkedInStaffCount = items.filter(
      (item) => item.latestCheckInAt,
    ).length;
    const onDutyCount = items.filter((item) =>
      ['ON_DUTY', 'OVERTIME'].includes(item.attendanceStatus),
    ).length;
    const absentCount = items.filter(
      (item) => item.attendanceStatus === 'ABSENT',
    ).length;
    const completedShiftCount = items.filter((item) =>
      ['COMPLETED', 'LATE'].includes(item.attendanceStatus),
    ).length;
    const lateCheckInCount = items.filter(
      (item) => item.lateMinutes > 0,
    ).length;
    const overtimeActiveCount = items.filter(
      (item) => item.attendanceStatus === 'OVERTIME',
    ).length;
    const workedHours = items
      .map((item) => item.workedHours)
      .filter((value): value is number => value != null);

    return {
      summary: {
        branchId: query.branchId,
        windowHours,
        activeStaffCount,
        checkedInStaffCount,
        onDutyCount,
        absentCount,
        completedShiftCount,
        lateCheckInCount,
        overtimeActiveCount,
        attendanceRate:
          activeStaffCount > 0
            ? Number(
                ((checkedInStaffCount / activeStaffCount) * 100).toFixed(2),
              )
            : 0,
        averageWorkedHours:
          workedHours.length > 0
            ? Number(
                (
                  workedHours.reduce((sum, value) => sum + value, 0) /
                  workedHours.length
                ).toFixed(2),
              )
            : 0,
        policy: policy,
        permissions: {
          canOverrideAttendance: canOverride,
        },
      },
      items,
    };
  }

  async getAttendanceNetworkSummary(
    query: RetailHrAttendanceNetworkSummaryQueryDto,
    actor: AttendanceActorContext = {},
  ): Promise<RetailHrAttendanceNetworkSummaryResponseDto> {
    const access = await this.retailEntitlementsService.assertBranchHasModules(
      query.branchId,
      [RetailModule.HR_ATTENDANCE],
    );
    const anchorBranch = access.branch;
    const entitlement = access.entitlements.find(
      (entry) => entry.module === RetailModule.HR_ATTENDANCE,
    );

    const limit = Math.min(Math.max(query.limit ?? 10, 1), 25);
    const windowHours = Math.min(Math.max(query.windowHours ?? 24, 1), 168);
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const now = new Date();
    const canOverride = await this.canOverrideAttendance(
      query.branchId,
      actor.id ?? null,
      actor.roles ?? [],
    );
    const tenantBranches =
      anchorBranch.retailTenantId != null
        ? await this.branchesRepository.find({
            where: {
              retailTenantId: anchorBranch.retailTenantId,
              isActive: true,
            },
            order: { name: 'ASC' },
          })
        : [anchorBranch];
    const branchIds = tenantBranches.map((branch) => branch.id);
    const policy = this.resolvePolicy(
      anchorBranch.timezone ?? null,
      entitlement?.metadata?.hrAttendancePolicy ?? null,
    );

    const [assignments, logs] = await Promise.all([
      this.branchStaffAssignmentsRepository.find({
        where: {
          branchId: In(branchIds),
          isActive: true,
        },
        relations: { user: true },
      }),
      this.hrAttendanceLogsRepository
        .createQueryBuilder('attendance')
        .leftJoinAndSelect('attendance.user', 'user')
        .where('attendance.branchId IN (:...branchIds)', { branchIds })
        .andWhere(
          '(attendance.checkInAt >= :windowStart OR attendance.checkOutAt IS NULL)',
          {
            windowStart: windowStart.toISOString(),
          },
        )
        .orderBy('attendance.checkInAt', 'DESC')
        .addOrderBy('attendance.id', 'DESC')
        .getMany(),
    ]);

    const branchCards = tenantBranches
      .map((branch) => {
        const branchAssignments = assignments.filter(
          (assignment) => assignment.branchId === branch.id,
        );
        const latestLogByUserId = new Map<number, HrAttendanceLog>();

        for (const log of logs) {
          if (log.branchId !== branch.id) {
            continue;
          }

          if (!latestLogByUserId.has(log.userId)) {
            latestLogByUserId.set(log.userId, log);
          }
        }

        const items = branchAssignments.map((assignment) =>
          this.mapAttendanceItem(
            assignment,
            latestLogByUserId.get(assignment.userId) ?? null,
            policy,
            now,
            windowStart,
          ),
        );

        return this.mapAttendanceNetworkBranch(branch, items, windowHours);
      })
      .filter((branch) =>
        this.matchesAttendanceNetworkRisk(branch.highestRisk, query.risk),
      )
      .sort((left, right) => this.compareAttendanceNetworkBranch(left, right))
      .slice(0, limit);

    return {
      anchorBranchId: anchorBranch.id,
      retailTenantId: anchorBranch.retailTenantId ?? null,
      branchCount: tenantBranches.length,
      windowHours,
      activeStaffCount: branchCards.reduce(
        (sum, branch) => sum + branch.activeStaffCount,
        0,
      ),
      checkedInStaffCount: branchCards.reduce(
        (sum, branch) => sum + branch.checkedInStaffCount,
        0,
      ),
      onDutyCount: branchCards.reduce(
        (sum, branch) => sum + branch.onDutyCount,
        0,
      ),
      absentCount: branchCards.reduce(
        (sum, branch) => sum + branch.absentCount,
        0,
      ),
      lateCheckInCount: branchCards.reduce(
        (sum, branch) => sum + branch.lateCheckInCount,
        0,
      ),
      overtimeActiveCount: branchCards.reduce(
        (sum, branch) => sum + branch.overtimeActiveCount,
        0,
      ),
      averageAttendanceRate:
        branchCards.length > 0
          ? Number(
              (
                branchCards.reduce(
                  (sum, branch) => sum + branch.attendanceRate,
                  0,
                ) / branchCards.length
              ).toFixed(2),
            )
          : 0,
      criticalBranchCount: branchCards.filter(
        (branch) => branch.highestRisk === 'CRITICAL',
      ).length,
      highBranchCount: branchCards.filter(
        (branch) => branch.highestRisk === 'HIGH',
      ).length,
      normalBranchCount: branchCards.filter(
        (branch) => branch.highestRisk === 'NORMAL',
      ).length,
      permissions: {
        canOverrideAttendance: canOverride,
      },
      alerts: this.buildAttendanceNetworkAlerts(branchCards),
      branches: branchCards,
    };
  }

  async exportAttendanceNetworkSummaryCsv(
    query: RetailHrAttendanceNetworkSummaryQueryDto,
  ): Promise<string> {
    const summary = await this.getAttendanceNetworkSummary(query);
    const header = [
      'branchId',
      'branchName',
      'branchCode',
      'highestRisk',
      'highestRiskReason',
      'activeStaffCount',
      'checkedInStaffCount',
      'onDutyCount',
      'absentCount',
      'lateCheckInCount',
      'overtimeActiveCount',
      'attendanceRate',
      'averageWorkedHours',
      'lastActivityAt',
    ];
    const lines = [header.join(',')];

    for (const branch of summary.branches) {
      lines.push(
        [
          branch.branchId,
          this.escapeCsvValue(branch.branchName),
          this.escapeCsvValue(branch.branchCode ?? ''),
          branch.highestRisk,
          this.escapeCsvValue(branch.highestRiskReason),
          branch.activeStaffCount,
          branch.checkedInStaffCount,
          branch.onDutyCount,
          branch.absentCount,
          branch.lateCheckInCount,
          branch.overtimeActiveCount,
          branch.attendanceRate,
          branch.averageWorkedHours,
          this.formatCsvDate(branch.lastActivityAt),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getAttendanceExceptions(
    query: RetailHrAttendanceExceptionsQueryDto,
    actor: AttendanceActorContext = {},
  ): Promise<RetailHrAttendanceExceptionsResponseDto> {
    const attendance = await this.getAttendanceSummary(
      {
        branchId: query.branchId,
        limit: 100,
        windowHours: query.windowHours,
      },
      actor,
    );
    const canOverride = attendance.summary.permissions.canOverrideAttendance;
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const allItems = attendance.items
      .map((item) =>
        this.mapAttendanceExceptionItem(
          query.branchId,
          attendance.summary.windowHours,
          item,
          canOverride,
        ),
      )
      .filter(
        (item): item is RetailHrAttendanceExceptionItemResponseDto =>
          item != null,
      );
    const filteredItems = allItems
      .filter((item) =>
        this.matchesAttendanceExceptionQueue(item.queueType, query.queueType),
      )
      .filter((item) =>
        this.matchesAttendanceExceptionPriority(item.priority, query.priority),
      )
      .sort((left, right) => this.compareAttendanceExceptionItem(left, right));
    const lastActivityAt =
      attendance.items
        .flatMap((item) =>
          [item.latestCheckInAt, item.latestCheckOutAt].filter(Boolean),
        )
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

    return {
      summary: {
        branchId: query.branchId,
        windowHours: attendance.summary.windowHours,
        totalExceptionCount: allItems.length,
        filteredExceptionCount: filteredItems.length,
        absentCount: allItems.filter(
          (item) =>
            item.queueType === RetailHrAttendanceExceptionQueueFilter.ABSENT,
        ).length,
        lateCount: allItems.filter(
          (item) =>
            item.queueType === RetailHrAttendanceExceptionQueueFilter.LATE,
        ).length,
        overtimeCount: allItems.filter(
          (item) =>
            item.queueType === RetailHrAttendanceExceptionQueueFilter.OVERTIME,
        ).length,
        criticalCount: filteredItems.filter(
          (item) =>
            item.priority ===
            RetailHrAttendanceExceptionPriorityFilter.CRITICAL,
        ).length,
        highCount: filteredItems.filter(
          (item) =>
            item.priority === RetailHrAttendanceExceptionPriorityFilter.HIGH,
        ).length,
        normalCount: filteredItems.filter(
          (item) =>
            item.priority === RetailHrAttendanceExceptionPriorityFilter.NORMAL,
        ).length,
        lastActivityAt,
        permissions: {
          canOverrideAttendance: canOverride,
        },
      },
      actions: [
        {
          type: 'VIEW_HR_ATTENDANCE',
          method: 'GET',
          path: `/retail/v1/ops/hr-attendance?branchId=${query.branchId}&windowHours=${attendance.summary.windowHours}`,
          body: null,
          enabled: true,
        },
      ],
      items: filteredItems.slice(0, limit),
    };
  }

  async exportAttendanceExceptionsCsv(
    query: RetailHrAttendanceExceptionsQueryDto,
    actor: AttendanceActorContext = {},
  ): Promise<string> {
    const exceptions = await this.getAttendanceExceptions(query, actor);
    const header = [
      'branchId',
      'windowHours',
      'userId',
      'displayName',
      'email',
      'role',
      'queueType',
      'priority',
      'priorityReason',
      'latestCheckInAt',
      'latestCheckOutAt',
      'workedHours',
      'lateMinutes',
      'overtimeHours',
      'actionTypes',
    ];
    const lines = [header.join(',')];

    for (const item of exceptions.items) {
      lines.push(
        [
          exceptions.summary.branchId,
          exceptions.summary.windowHours,
          item.userId,
          this.escapeCsvValue(item.displayName ?? ''),
          this.escapeCsvValue(item.email),
          this.escapeCsvValue(item.role),
          this.escapeCsvValue(item.queueType),
          this.escapeCsvValue(item.priority),
          this.escapeCsvValue(item.priorityReason),
          this.formatCsvDate(item.latestCheckInAt),
          this.formatCsvDate(item.latestCheckOutAt),
          item.workedHours ?? '',
          item.lateMinutes,
          item.overtimeHours,
          this.escapeCsvValue(
            item.actions
              .filter((action) => action.enabled)
              .map((action) => action.type)
              .join('|'),
          ),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getAttendanceDetail(
    userId: number,
    query: RetailHrAttendanceDetailQueryDto,
    actor: AttendanceActorContext = {},
  ): Promise<RetailHrAttendanceDetailResponseDto> {
    const access = await this.retailEntitlementsService.assertBranchHasModules(
      query.branchId,
      [RetailModule.HR_ATTENDANCE],
    );
    const entitlement = access.entitlements.find(
      (entry) => entry.module === RetailModule.HR_ATTENDANCE,
    );
    const assignment = await this.assertTargetAssignment(
      query.branchId,
      userId,
    );
    const limit = Math.min(Math.max(query.limit ?? 10, 1), 50);
    const windowHours = Math.min(Math.max(query.windowHours ?? 168, 1), 720);
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const now = new Date();
    const canOverride = await this.canOverrideAttendance(
      query.branchId,
      actor.id ?? null,
      actor.roles ?? [],
    );
    const policy = this.resolvePolicy(
      access.branch.timezone ?? null,
      entitlement?.metadata?.hrAttendancePolicy ?? null,
    );
    const logs = await this.hrAttendanceLogsRepository
      .createQueryBuilder('attendance')
      .where('attendance.branchId = :branchId', { branchId: query.branchId })
      .andWhere('attendance.userId = :userId', { userId })
      .andWhere(
        '(attendance.checkInAt >= :windowStart OR attendance.checkOutAt IS NULL)',
        {
          windowStart: windowStart.toISOString(),
        },
      )
      .orderBy('attendance.checkInAt', 'DESC')
      .addOrderBy('attendance.id', 'DESC')
      .limit(limit)
      .getMany();

    const currentItem = this.mapAttendanceItem(
      assignment,
      logs[0] ?? null,
      policy,
      now,
      windowStart,
    );
    const overrideActorIds = Array.from(
      new Set(
        logs
          .map((log) =>
            this.normalizeOptionalNumber(log.metadata?.overrideByUserId),
          )
          .filter((value): value is number => value != null),
      ),
    );
    const overrideActors =
      overrideActorIds.length > 0
        ? await this.usersRepository.find({
            where: { id: In(overrideActorIds) },
            select: { id: true, displayName: true, email: true } as any,
          })
        : [];
    const overrideActorById = new Map<
      number,
      Pick<User, 'id' | 'displayName' | 'email'>
    >(overrideActors.map((user) => [user.id, user]));
    const detailLogs = logs.map((log) =>
      this.mapAttendanceDetailLog(log, policy, now, overrideActorById),
    );
    const lastActivityAt =
      detailLogs
        .flatMap((log) => [log.checkInAt, log.checkOutAt].filter(Boolean))
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

    return {
      summary: {
        branchId: query.branchId,
        userId,
        displayName: assignment.user?.displayName ?? null,
        email: assignment.user?.email ?? '',
        role: assignment.role,
        windowHours,
        currentStatus: currentItem.attendanceStatus,
        latestCheckInAt: currentItem.latestCheckInAt,
        latestCheckOutAt: currentItem.latestCheckOutAt,
        workedHours: currentItem.workedHours,
        lateMinutes: currentItem.lateMinutes,
        overtimeHours: currentItem.overtimeHours,
        shiftCount: detailLogs.length,
        openShiftCount: detailLogs.filter((log) => log.checkOutAt == null)
          .length,
        lastActivityAt,
        policy,
        permissions: {
          canOverrideAttendance: canOverride,
        },
      },
      actions: this.buildAttendanceDetailActions(
        userId,
        query.branchId,
        windowHours,
        currentItem.attendanceStatus,
        canOverride,
      ),
      logs: detailLogs,
    };
  }

  async exportAttendanceDetailCsv(
    userId: number,
    query: RetailHrAttendanceDetailQueryDto,
    actor: AttendanceActorContext = {},
  ): Promise<string> {
    const detail = await this.getAttendanceDetail(userId, query, actor);
    const header = [
      'branchId',
      'userId',
      'displayName',
      'email',
      'role',
      'windowHours',
      'currentStatus',
      'latestCheckInAt',
      'latestCheckOutAt',
      'workedHours',
      'lateMinutes',
      'overtimeHours',
      'shiftCount',
      'openShiftCount',
      'lastActivityAt',
      'policyShiftStartHour',
      'policyShiftEndHour',
      'policyGracePeriodMinutes',
      'policyOvertimeThresholdHours',
      'policyTimeZone',
      'attendanceLogId',
      'logStatus',
      'logCheckInAt',
      'logCheckOutAt',
      'logWorkedHours',
      'logLateMinutes',
      'logOvertimeHours',
      'logSource',
      'logNote',
      'logIsOverride',
      'overrideByUserId',
      'overrideByUserDisplayName',
      'overrideByUserEmail',
      'actionTypes',
    ];
    const lines = [header.join(',')];
    const logs =
      detail.logs.length > 0
        ? detail.logs
        : [
            {
              attendanceLogId: '',
              status: '',
              checkInAt: null,
              checkOutAt: null,
              workedHours: '',
              lateMinutes: '',
              overtimeHours: '',
              source: '',
              note: '',
              isOverride: '',
              overrideByUserId: '',
              overrideByUserDisplayName: '',
              overrideByUserEmail: '',
            },
          ];

    for (const log of logs) {
      lines.push(
        [
          detail.summary.branchId,
          detail.summary.userId,
          this.escapeCsvValue(detail.summary.displayName ?? ''),
          this.escapeCsvValue(detail.summary.email),
          this.escapeCsvValue(detail.summary.role),
          detail.summary.windowHours,
          this.escapeCsvValue(detail.summary.currentStatus),
          this.formatCsvDate(detail.summary.latestCheckInAt),
          this.formatCsvDate(detail.summary.latestCheckOutAt),
          detail.summary.workedHours ?? '',
          detail.summary.lateMinutes,
          detail.summary.overtimeHours,
          detail.summary.shiftCount,
          detail.summary.openShiftCount,
          this.formatCsvDate(detail.summary.lastActivityAt),
          detail.summary.policy.shiftStartHour,
          detail.summary.policy.shiftEndHour,
          detail.summary.policy.gracePeriodMinutes,
          detail.summary.policy.overtimeThresholdHours,
          this.escapeCsvValue(detail.summary.policy.timeZone),
          log.attendanceLogId,
          this.escapeCsvValue(String(log.status ?? '')),
          this.formatCsvDate(log.checkInAt as Date | string | null),
          this.formatCsvDate(log.checkOutAt as Date | string | null),
          log.workedHours ?? '',
          log.lateMinutes ?? '',
          log.overtimeHours ?? '',
          this.escapeCsvValue(String(log.source ?? '')),
          this.escapeCsvValue(String(log.note ?? '')),
          log.isOverride,
          log.overrideByUserId ?? '',
          this.escapeCsvValue(String(log.overrideByUserDisplayName ?? '')),
          this.escapeCsvValue(String(log.overrideByUserEmail ?? '')),
          this.escapeCsvValue(
            detail.actions
              .filter((action) => action.enabled)
              .map((action) => action.type)
              .join('|'),
          ),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async exportAttendanceComplianceCsv(
    query: RetailHrAttendanceComplianceExportQueryDto,
  ): Promise<string> {
    const { anchorBranch, windowHours, rows } =
      await this.getAttendanceComplianceDataset(query);

    const header = [
      'retailTenantId',
      'anchorBranchId',
      'branchId',
      'branchName',
      'branchCode',
      'userId',
      'displayName',
      'email',
      'role',
      'windowHours',
      'currentStatus',
      'exceptionQueueType',
      'exceptionPriority',
      'exceptionPriorityReason',
      'latestCheckInAt',
      'latestCheckOutAt',
      'workedHours',
      'lateMinutes',
      'overtimeHours',
      'shiftCount',
      'openShiftCount',
      'lastActivityAt',
      'policyShiftStartHour',
      'policyShiftEndHour',
      'policyGracePeriodMinutes',
      'policyOvertimeThresholdHours',
      'policyTimeZone',
      'attendanceLogId',
      'logStatus',
      'logCheckInAt',
      'logCheckOutAt',
      'logWorkedHours',
      'logLateMinutes',
      'logOvertimeHours',
      'logSource',
      'logNote',
      'logIsOverride',
      'overrideByUserId',
      'overrideByUserDisplayName',
      'overrideByUserEmail',
    ];
    const lines = [header.join(',')];

    for (const row of rows) {
      const exportLogs =
        row.detailLogs.length > 0
          ? row.detailLogs
          : [
              {
                attendanceLogId: '',
                status: '',
                checkInAt: null,
                checkOutAt: null,
                workedHours: '',
                lateMinutes: '',
                overtimeHours: '',
                source: '',
                note: '',
                isOverride: '',
                overrideByUserId: '',
                overrideByUserDisplayName: '',
                overrideByUserEmail: '',
              },
            ];

      for (const log of exportLogs) {
        lines.push(
          [
            row.branch.retailTenantId ?? '',
            anchorBranch.id,
            row.branch.id,
            this.escapeCsvValue(row.branch.name),
            this.escapeCsvValue(row.branch.code ?? ''),
            row.assignment.userId,
            this.escapeCsvValue(row.assignment.user?.displayName ?? ''),
            this.escapeCsvValue(row.assignment.user?.email ?? ''),
            this.escapeCsvValue(row.assignment.role),
            windowHours,
            this.escapeCsvValue(row.currentItem.attendanceStatus),
            this.escapeCsvValue(row.exception?.queueType ?? ''),
            this.escapeCsvValue(row.exception?.priority ?? ''),
            this.escapeCsvValue(row.exception?.priorityReason ?? ''),
            this.formatCsvDate(row.currentItem.latestCheckInAt),
            this.formatCsvDate(row.currentItem.latestCheckOutAt),
            row.currentItem.workedHours ?? '',
            row.currentItem.lateMinutes,
            row.currentItem.overtimeHours,
            row.detailLogs.length,
            row.detailLogs.filter((detailLog) => detailLog.checkOutAt == null)
              .length,
            this.formatCsvDate(row.lastActivityAt),
            row.policy.shiftStartHour,
            row.policy.shiftEndHour,
            row.policy.gracePeriodMinutes,
            row.policy.overtimeThresholdHours,
            this.escapeCsvValue(row.policy.timeZone),
            log.attendanceLogId,
            this.escapeCsvValue(String(log.status ?? '')),
            this.formatCsvDate(log.checkInAt as Date | string | null),
            this.formatCsvDate(log.checkOutAt as Date | string | null),
            log.workedHours ?? '',
            log.lateMinutes ?? '',
            log.overtimeHours ?? '',
            this.escapeCsvValue(String(log.source ?? '')),
            this.escapeCsvValue(String(log.note ?? '')),
            log.isOverride,
            log.overrideByUserId ?? '',
            this.escapeCsvValue(String(log.overrideByUserDisplayName ?? '')),
            this.escapeCsvValue(String(log.overrideByUserEmail ?? '')),
          ].join(','),
        );
      }
    }

    return lines.join('\n');
  }

  async getAttendanceComplianceSummary(
    query: RetailHrAttendanceComplianceExportQueryDto,
    actor: AttendanceActorContext = {},
  ): Promise<RetailHrAttendanceComplianceSummaryResponseDto> {
    const {
      anchorBranch,
      tenantBranches,
      windowHours,
      rows,
      totalStaffCount,
      totalExceptionCount,
    } = await this.getAttendanceComplianceDataset(query);
    const canOverride = await this.canOverrideAttendance(
      query.branchId,
      actor.id ?? null,
      actor.roles ?? [],
    );
    const filteredExceptionCount = rows.filter(
      (row) => row.exception != null,
    ).length;
    const filteredBranchCount = new Set(rows.map((row) => row.branch.id)).size;
    const lastActivityAt =
      rows
        .map((row) => row.lastActivityAt)
        .filter((value): value is Date => value != null)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

    return {
      summary: {
        anchorBranchId: anchorBranch.id,
        retailTenantId: anchorBranch.retailTenantId ?? null,
        branchCount: tenantBranches.length,
        filteredBranchCount,
        windowHours,
        totalStaffCount,
        filteredStaffCount: rows.length,
        totalExceptionCount,
        filteredExceptionCount,
        lastActivityAt,
        permissions: {
          canOverrideAttendance: canOverride,
        },
      },
      statusCounts: this.buildAttendanceComplianceCountEntries(
        rows.map((row) => row.currentItem.attendanceStatus),
        ['ABSENT', 'COMPLETED', 'LATE', 'ON_DUTY', 'OVERTIME'],
      ),
      queueTypeCounts: this.buildAttendanceComplianceCountEntries(
        rows
          .map((row) => row.exception?.queueType ?? null)
          .filter(
            (value): value is RetailHrAttendanceExceptionQueueFilter =>
              value != null,
          ),
        [
          RetailHrAttendanceExceptionQueueFilter.ABSENT,
          RetailHrAttendanceExceptionQueueFilter.LATE,
          RetailHrAttendanceExceptionQueueFilter.OVERTIME,
        ],
      ),
      priorityCounts: this.buildAttendanceComplianceCountEntries(
        rows
          .map((row) => row.exception?.priority ?? null)
          .filter(
            (value): value is RetailHrAttendanceExceptionPriorityFilter =>
              value != null,
          ),
        [
          RetailHrAttendanceExceptionPriorityFilter.CRITICAL,
          RetailHrAttendanceExceptionPriorityFilter.HIGH,
          RetailHrAttendanceExceptionPriorityFilter.NORMAL,
        ],
      ),
      branches: this.buildAttendanceComplianceBranchSummaries(rows),
      topStaffExceptions:
        this.buildAttendanceComplianceTopStaffExceptions(rows),
    };
  }

  async checkIn(
    dto: MutateRetailHrAttendanceDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<RetailHrAttendanceMutationResponseDto> {
    const assignment = await this.assertActiveAssignment(
      dto.branchId,
      actor.id ?? null,
    );

    const openLog = await this.hrAttendanceLogsRepository.findOne({
      where: {
        branchId: dto.branchId,
        userId: assignment.userId,
        checkOutAt: IsNull(),
      },
      order: {
        checkInAt: 'DESC',
        id: 'DESC',
      },
    });

    if (openLog) {
      throw new BadRequestException(
        'User is already checked in for this branch',
      );
    }

    const attendanceLog = this.hrAttendanceLogsRepository.create({
      branchId: dto.branchId,
      userId: assignment.userId,
      checkInAt: new Date(),
      checkOutAt: null,
      source: dto.source?.trim() || 'RETAIL_OPS',
      note: dto.note?.trim() || null,
      metadata: dto.metadata ?? null,
    });

    const savedLog = await this.hrAttendanceLogsRepository.save(attendanceLog);
    return this.mapMutationResponse(assignment, savedLog, 'CHECKED_IN');
  }

  async checkOut(
    dto: MutateRetailHrAttendanceDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<RetailHrAttendanceMutationResponseDto> {
    const assignment = await this.assertActiveAssignment(
      dto.branchId,
      actor.id ?? null,
    );

    const openLog = await this.hrAttendanceLogsRepository.findOne({
      where: {
        branchId: dto.branchId,
        userId: assignment.userId,
        checkOutAt: IsNull(),
      },
      order: {
        checkInAt: 'DESC',
        id: 'DESC',
      },
    });

    if (!openLog) {
      throw new BadRequestException(
        'User is not currently checked in for this branch',
      );
    }

    openLog.checkOutAt = new Date();
    openLog.source = dto.source?.trim() || openLog.source || 'RETAIL_OPS';
    openLog.note = dto.note?.trim() || openLog.note || null;
    openLog.metadata = {
      ...(openLog.metadata ?? {}),
      ...(dto.metadata ?? {}),
    };

    const savedLog = await this.hrAttendanceLogsRepository.save(openLog);
    return this.mapMutationResponse(assignment, savedLog, 'CHECKED_OUT');
  }

  async overrideCheckIn(
    dto: OverrideRetailHrAttendanceCheckInDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<RetailHrAttendanceMutationResponseDto> {
    await this.assertOverrideAuthority(
      dto.branchId,
      actor.id ?? null,
      actor.roles ?? [],
    );
    const targetAssignment = await this.assertTargetAssignment(
      dto.branchId,
      dto.targetUserId,
    );

    const openLog = await this.hrAttendanceLogsRepository.findOne({
      where: {
        branchId: dto.branchId,
        userId: dto.targetUserId,
        checkOutAt: IsNull(),
      },
      order: {
        checkInAt: 'DESC',
        id: 'DESC',
      },
    });

    if (openLog) {
      throw new BadRequestException(
        'Target user is already checked in for this branch',
      );
    }

    const checkInAt = new Date(dto.checkInAt);
    const attendanceLog = this.hrAttendanceLogsRepository.create({
      branchId: dto.branchId,
      userId: dto.targetUserId,
      checkInAt,
      checkOutAt: null,
      source: dto.source?.trim() || 'MANAGER_OVERRIDE',
      note: dto.note?.trim() || null,
      metadata: {
        ...(dto.metadata ?? {}),
        override: true,
        overrideByUserId: actor.id ?? null,
      },
    });

    const savedLog = await this.hrAttendanceLogsRepository.save(attendanceLog);
    return this.mapMutationResponse(
      targetAssignment,
      savedLog,
      'OVERRIDE_CHECKED_IN',
    );
  }

  async overrideCheckOut(
    dto: OverrideRetailHrAttendanceCheckOutDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<RetailHrAttendanceMutationResponseDto> {
    await this.assertOverrideAuthority(
      dto.branchId,
      actor.id ?? null,
      actor.roles ?? [],
    );
    const targetAssignment = await this.assertTargetAssignment(
      dto.branchId,
      dto.targetUserId,
    );

    const openLog = dto.attendanceLogId
      ? await this.hrAttendanceLogsRepository.findOne({
          where: {
            id: dto.attendanceLogId,
            branchId: dto.branchId,
            userId: dto.targetUserId,
            checkOutAt: IsNull(),
          },
        })
      : await this.hrAttendanceLogsRepository.findOne({
          where: {
            branchId: dto.branchId,
            userId: dto.targetUserId,
            checkOutAt: IsNull(),
          },
          order: {
            checkInAt: 'DESC',
            id: 'DESC',
          },
        });

    if (!openLog) {
      throw new BadRequestException(
        'Target user does not have an open attendance log for this branch',
      );
    }

    const checkOutAt = new Date(dto.checkOutAt);
    if (checkOutAt.getTime() < openLog.checkInAt.getTime()) {
      throw new BadRequestException(
        'Check-out time cannot be earlier than check-in time',
      );
    }

    openLog.checkOutAt = checkOutAt;
    openLog.source = dto.source?.trim() || openLog.source || 'MANAGER_OVERRIDE';
    openLog.note = dto.note?.trim() || openLog.note || null;
    openLog.metadata = {
      ...(openLog.metadata ?? {}),
      ...(dto.metadata ?? {}),
      override: true,
      overrideByUserId: actor.id ?? null,
    };

    const savedLog = await this.hrAttendanceLogsRepository.save(openLog);
    return this.mapMutationResponse(
      targetAssignment,
      savedLog,
      'OVERRIDE_CHECKED_OUT',
    );
  }

  private mapAttendanceItem(
    assignment: BranchStaffAssignment,
    log: HrAttendanceLog | null,
    policy: HrAttendancePolicy,
    now: Date,
    windowStart: Date,
  ): RetailHrAttendanceItemResponseDto {
    if (!log || (log.checkInAt < windowStart && log.checkOutAt != null)) {
      return {
        userId: assignment.userId,
        displayName: assignment.user?.displayName ?? null,
        email: assignment.user?.email ?? '',
        role: assignment.role,
        attendanceStatus: 'ABSENT',
        latestCheckInAt: null,
        latestCheckOutAt: null,
        workedHours: null,
        lateMinutes: 0,
        overtimeHours: 0,
      };
    }

    const checkOutAt = log.checkOutAt ?? null;
    const workedHours = Number(
      (
        ((checkOutAt ?? now).getTime() - log.checkInAt.getTime()) /
        3600000
      ).toFixed(2),
    );
    const scheduledStartMinutes =
      policy.shiftStartHour * 60 + policy.gracePeriodMinutes;
    const actualCheckInMinutes = this.getMinutesInTimeZone(
      log.checkInAt,
      policy.timeZone,
    );
    const lateMinutes = Math.max(
      actualCheckInMinutes - scheduledStartMinutes,
      0,
    );
    const overtimeHours = Math.max(
      Number((workedHours - policy.overtimeThresholdHours).toFixed(2)),
      0,
    );

    let attendanceStatus = 'COMPLETED';
    if (!checkOutAt) {
      attendanceStatus = overtimeHours > 0 ? 'OVERTIME' : 'ON_DUTY';
    } else if (lateMinutes > 0) {
      attendanceStatus = 'LATE';
    }

    return {
      userId: assignment.userId,
      displayName: assignment.user?.displayName ?? null,
      email: assignment.user?.email ?? '',
      role: assignment.role,
      attendanceStatus,
      latestCheckInAt: log.checkInAt,
      latestCheckOutAt: checkOutAt,
      workedHours,
      lateMinutes,
      overtimeHours,
    };
  }

  private mapMutationResponse(
    assignment: BranchStaffAssignment,
    log: HrAttendanceLog,
    action:
      | 'CHECKED_IN'
      | 'CHECKED_OUT'
      | 'OVERRIDE_CHECKED_IN'
      | 'OVERRIDE_CHECKED_OUT',
  ): RetailHrAttendanceMutationResponseDto {
    const workedHours =
      log.checkOutAt != null
        ? Number(
            (
              (log.checkOutAt.getTime() - log.checkInAt.getTime()) /
              3600000
            ).toFixed(2),
          )
        : null;

    return {
      attendanceLogId: log.id,
      branchId: log.branchId,
      userId: log.userId,
      displayName: assignment.user?.displayName ?? null,
      email: assignment.user?.email ?? '',
      role: assignment.role,
      action,
      checkInAt: log.checkInAt,
      checkOutAt: log.checkOutAt ?? null,
      workedHours,
      source: log.source ?? null,
      note: log.note ?? null,
    };
  }

  private mapAttendanceNetworkBranch(
    branch: Branch,
    items: RetailHrAttendanceItemResponseDto[],
    windowHours: number,
  ): RetailHrAttendanceNetworkBranchResponseDto {
    const activeStaffCount = items.length;
    const checkedInStaffCount = items.filter(
      (item) => item.latestCheckInAt != null,
    ).length;
    const onDutyCount = items.filter((item) =>
      ['ON_DUTY', 'OVERTIME'].includes(item.attendanceStatus),
    ).length;
    const absentCount = items.filter(
      (item) => item.attendanceStatus === 'ABSENT',
    ).length;
    const lateCheckInCount = items.filter(
      (item) => item.lateMinutes > 0,
    ).length;
    const overtimeActiveCount = items.filter(
      (item) => item.attendanceStatus === 'OVERTIME',
    ).length;
    const workedHours = items
      .map((item) => item.workedHours)
      .filter((value): value is number => value != null);
    const attendanceRate =
      activeStaffCount > 0
        ? Number(((checkedInStaffCount / activeStaffCount) * 100).toFixed(2))
        : 0;
    const averageWorkedHours =
      workedHours.length > 0
        ? Number(
            (
              workedHours.reduce((sum, value) => sum + value, 0) /
              workedHours.length
            ).toFixed(2),
          )
        : 0;
    const lastActivityAt =
      items
        .flatMap((item) =>
          [item.latestCheckInAt, item.latestCheckOutAt].filter(Boolean),
        )
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

    let highestRisk: RetailHrAttendanceNetworkBranchResponseDto['highestRisk'] =
      'NORMAL';
    let highestRiskReason = `Attendance coverage is within expected range for the last ${windowHours} hours.`;

    if (absentCount > 0) {
      highestRisk = 'CRITICAL';
      highestRiskReason =
        'At least one active branch staff member has no recent attendance activity.';
    } else if (lateCheckInCount > 0 || overtimeActiveCount > 0) {
      highestRisk = 'HIGH';
      highestRiskReason =
        lateCheckInCount > 0
          ? 'At least one branch staff member checked in late during the selected window.'
          : 'At least one branch staff member is currently beyond the overtime threshold.';
    }

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code ?? null,
      highestRisk,
      highestRiskReason,
      activeStaffCount,
      checkedInStaffCount,
      onDutyCount,
      absentCount,
      lateCheckInCount,
      overtimeActiveCount,
      attendanceRate,
      averageWorkedHours,
      lastActivityAt,
      actions: [
        {
          type: 'VIEW_HR_ATTENDANCE',
          method: 'GET',
          path: `/retail/v1/ops/hr-attendance?branchId=${branch.id}&windowHours=${windowHours}`,
          body: null,
          enabled: true,
        },
        {
          type: 'VIEW_HR_ATTENDANCE_EXCEPTIONS',
          method: 'GET',
          path: `/retail/v1/ops/hr-attendance/exceptions?branchId=${branch.id}&windowHours=${windowHours}${this.buildAttendanceExceptionQuery(highestRisk, lateCheckInCount, overtimeActiveCount)}`,
          body: null,
          enabled: highestRisk !== 'NORMAL',
        },
      ],
    };
  }

  private mapAttendanceExceptionItem(
    branchId: number,
    windowHours: number,
    item: RetailHrAttendanceItemResponseDto,
    canOverride: boolean,
  ): RetailHrAttendanceExceptionItemResponseDto | null {
    const classification = this.mapAttendanceExceptionClassification(item);
    if (!classification) {
      return null;
    }

    return {
      userId: item.userId,
      displayName: item.displayName,
      email: item.email,
      role: item.role,
      queueType: classification.queueType,
      priority: classification.priority,
      priorityReason: classification.priorityReason,
      latestCheckInAt: item.latestCheckInAt,
      latestCheckOutAt: item.latestCheckOutAt,
      workedHours: item.workedHours,
      lateMinutes: item.lateMinutes,
      overtimeHours: item.overtimeHours,
      actions: this.buildAttendanceExceptionActions(
        branchId,
        windowHours,
        item.userId,
        classification.queueType,
        canOverride,
      ),
    };
  }

  private mapAttendanceDetailLog(
    log: HrAttendanceLog,
    policy: HrAttendancePolicy,
    now: Date,
    overrideActorById: Map<number, Pick<User, 'id' | 'displayName' | 'email'>>,
  ): RetailHrAttendanceDetailLogResponseDto {
    const checkOutAt = log.checkOutAt ?? null;
    const workedHours = Number(
      (
        ((checkOutAt ?? now).getTime() - log.checkInAt.getTime()) /
        3600000
      ).toFixed(2),
    );
    const scheduledStartMinutes =
      policy.shiftStartHour * 60 + policy.gracePeriodMinutes;
    const actualCheckInMinutes = this.getMinutesInTimeZone(
      log.checkInAt,
      policy.timeZone,
    );
    const lateMinutes = Math.max(
      actualCheckInMinutes - scheduledStartMinutes,
      0,
    );
    const overtimeHours = Math.max(
      Number((workedHours - policy.overtimeThresholdHours).toFixed(2)),
      0,
    );

    let status = 'COMPLETED';
    if (!checkOutAt) {
      status = overtimeHours > 0 ? 'OVERTIME' : 'ON_DUTY';
    } else if (lateMinutes > 0) {
      status = 'LATE';
    }

    const overrideByUserId = this.normalizeOptionalNumber(
      log.metadata?.overrideByUserId,
    );
    const overrideActor =
      overrideByUserId != null
        ? (overrideActorById.get(overrideByUserId) ?? null)
        : null;

    return {
      attendanceLogId: log.id,
      status,
      checkInAt: log.checkInAt,
      checkOutAt,
      workedHours,
      lateMinutes,
      overtimeHours,
      source: log.source ?? null,
      note: log.note ?? null,
      isOverride: Boolean(log.metadata?.override),
      overrideByUserId,
      overrideByUserDisplayName: overrideActor?.displayName ?? null,
      overrideByUserEmail: overrideActor?.email ?? null,
    };
  }

  private buildAttendanceDetailActions(
    userId: number,
    branchId: number,
    windowHours: number,
    currentStatus: string,
    canOverride: boolean,
  ): RetailHrAttendanceDetailActionResponseDto[] {
    return [
      {
        type: 'VIEW_HR_ATTENDANCE',
        method: 'GET',
        path: `/retail/v1/ops/hr-attendance?branchId=${branchId}&windowHours=${windowHours}`,
        body: null,
        enabled: true,
      },
      {
        type: 'VIEW_HR_ATTENDANCE_EXCEPTIONS',
        method: 'GET',
        path: `/retail/v1/ops/hr-attendance/exceptions?branchId=${branchId}&windowHours=${windowHours}`,
        body: null,
        enabled: true,
      },
      {
        type: 'EXPORT_HR_ATTENDANCE_STAFF_DETAIL',
        method: 'GET',
        path: `/retail/v1/ops/hr-attendance/staff/${userId}/export?branchId=${branchId}&windowHours=${windowHours}`,
        body: null,
        enabled: true,
      },
      {
        type:
          currentStatus === 'ABSENT'
            ? 'OVERRIDE_HR_ATTENDANCE_CHECK_IN'
            : 'OVERRIDE_HR_ATTENDANCE_CHECK_OUT',
        method: 'POST',
        path:
          currentStatus === 'ABSENT'
            ? '/retail/v1/ops/hr-attendance/overrides/check-in'
            : '/retail/v1/ops/hr-attendance/overrides/check-out',
        body: {
          branchId,
          targetUserId: userId,
        },
        enabled: canOverride,
      },
    ];
  }

  private buildAttendanceExceptionActions(
    branchId: number,
    windowHours: number,
    userId: number,
    queueType: RetailHrAttendanceExceptionQueueFilter,
    canOverride: boolean,
  ): RetailHrAttendanceExceptionActionResponseDto[] {
    return [
      {
        type: 'VIEW_HR_ATTENDANCE',
        method: 'GET',
        path: `/retail/v1/ops/hr-attendance?branchId=${branchId}&windowHours=${windowHours}`,
        body: null,
        enabled: true,
      },
      {
        type: 'VIEW_HR_ATTENDANCE_EXCEPTION_QUEUE',
        method: 'GET',
        path: `/retail/v1/ops/hr-attendance/exceptions?branchId=${branchId}&windowHours=${windowHours}&queueType=${queueType}`,
        body: null,
        enabled: true,
      },
      {
        type: 'VIEW_HR_ATTENDANCE_STAFF_DETAIL',
        method: 'GET',
        path: `/retail/v1/ops/hr-attendance/staff/${userId}?branchId=${branchId}&windowHours=${windowHours}`,
        body: null,
        enabled: true,
      },
      {
        type: 'OVERRIDE_HR_ATTENDANCE',
        method: 'POST',
        path:
          queueType === RetailHrAttendanceExceptionQueueFilter.ABSENT
            ? '/retail/v1/ops/hr-attendance/overrides/check-in'
            : '/retail/v1/ops/hr-attendance/overrides/check-out',
        body: {
          branchId,
          targetUserId: userId,
        },
        enabled: canOverride,
      },
    ];
  }

  private mapAttendanceExceptionClassification(
    item: RetailHrAttendanceItemResponseDto,
  ): AttendanceComplianceClassification | null {
    if (item.attendanceStatus === 'ABSENT') {
      return {
        queueType: RetailHrAttendanceExceptionQueueFilter.ABSENT,
        priority: RetailHrAttendanceExceptionPriorityFilter.CRITICAL,
        priorityReason:
          'No recent attendance activity was found for this active branch staff member.',
      };
    }

    if (item.attendanceStatus === 'OVERTIME' || item.overtimeHours > 0) {
      return {
        queueType: RetailHrAttendanceExceptionQueueFilter.OVERTIME,
        priority:
          item.overtimeHours >= 2
            ? RetailHrAttendanceExceptionPriorityFilter.CRITICAL
            : RetailHrAttendanceExceptionPriorityFilter.HIGH,
        priorityReason:
          'The active shift is beyond the configured overtime threshold.',
      };
    }

    if (item.lateMinutes > 0) {
      return {
        queueType: RetailHrAttendanceExceptionQueueFilter.LATE,
        priority:
          item.lateMinutes >= 60
            ? RetailHrAttendanceExceptionPriorityFilter.CRITICAL
            : item.lateMinutes >= 15
              ? RetailHrAttendanceExceptionPriorityFilter.HIGH
              : RetailHrAttendanceExceptionPriorityFilter.NORMAL,
        priorityReason:
          'The staff member checked in after the configured grace period.',
      };
    }

    return null;
  }

  private async getAttendanceComplianceDataset(
    query: RetailHrAttendanceComplianceExportQueryDto,
  ): Promise<{
    anchorBranch: Branch;
    tenantBranches: Branch[];
    windowHours: number;
    rows: AttendanceComplianceRow[];
    totalStaffCount: number;
    totalExceptionCount: number;
  }> {
    const access = await this.retailEntitlementsService.assertBranchHasModules(
      query.branchId,
      [RetailModule.HR_ATTENDANCE],
    );
    const anchorBranch = access.branch;
    const entitlement = access.entitlements.find(
      (entry) => entry.module === RetailModule.HR_ATTENDANCE,
    );
    const windowHours = Math.min(Math.max(query.windowHours ?? 168, 1), 720);
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const now = new Date();
    const tenantBranches =
      anchorBranch.retailTenantId != null
        ? await this.branchesRepository.find({
            where: {
              retailTenantId: anchorBranch.retailTenantId,
              isActive: true,
            },
            order: { name: 'ASC' },
          })
        : [anchorBranch];
    const tenantBranchIds = tenantBranches.map((branch) => branch.id);
    const branchIds =
      query.branchIds?.filter((branchId) =>
        tenantBranchIds.includes(branchId),
      ) ?? tenantBranchIds;
    const userIds = query.userIds ?? null;
    const statuses = query.statuses?.length
      ? new Set<RetailHrAttendanceComplianceStatusFilter>(query.statuses)
      : null;
    const queueTypes = query.queueTypes?.length
      ? new Set<RetailHrAttendanceExceptionQueueFilter>(query.queueTypes)
      : null;
    const priorities = query.priorities?.length
      ? new Set<RetailHrAttendanceExceptionPriorityFilter>(query.priorities)
      : null;
    const branchById = new Map<number, Branch>(
      tenantBranches.map((branch) => [branch.id, branch]),
    );

    const [assignments, logs] =
      branchIds.length > 0
        ? await Promise.all([
            this.branchStaffAssignmentsRepository.find({
              where: {
                branchId: In(branchIds),
                ...(userIds ? { userId: In(userIds) } : {}),
                isActive: true,
              },
              relations: { user: true },
            }),
            this.hrAttendanceLogsRepository
              .createQueryBuilder('attendance')
              .where('attendance.branchId IN (:...branchIds)', { branchIds })
              .andWhere(
                '(attendance.checkInAt >= :windowStart OR attendance.checkOutAt IS NULL)',
                {
                  windowStart: windowStart.toISOString(),
                },
              )
              .andWhere(
                userIds?.length ? 'attendance.userId IN (:...userIds)' : '1=1',
                userIds?.length ? { userIds } : undefined,
              )
              .orderBy('attendance.branchId', 'ASC')
              .addOrderBy('attendance.userId', 'ASC')
              .addOrderBy('attendance.checkInAt', 'DESC')
              .addOrderBy('attendance.id', 'DESC')
              .getMany(),
          ])
        : [[], []];
    const overrideActorIds = Array.from(
      new Set(
        logs
          .map((log) =>
            this.normalizeOptionalNumber(log.metadata?.overrideByUserId),
          )
          .filter((value): value is number => value != null),
      ),
    );
    const overrideActors =
      overrideActorIds.length > 0
        ? await this.usersRepository.find({
            where: { id: In(overrideActorIds) },
            select: { id: true, displayName: true, email: true } as any,
          })
        : [];
    const overrideActorById = new Map<
      number,
      Pick<User, 'id' | 'displayName' | 'email'>
    >(overrideActors.map((user) => [user.id, user]));
    const logsByAssignmentKey = new Map<string, HrAttendanceLog[]>();

    for (const log of logs) {
      const key = `${log.branchId}:${log.userId}`;
      const existingLogs = logsByAssignmentKey.get(key);
      if (existingLogs) {
        existingLogs.push(log);
      } else {
        logsByAssignmentKey.set(key, [log]);
      }
    }

    const sortedAssignments = [...assignments].sort((left, right) => {
      const leftBranch = branchById.get(left.branchId);
      const rightBranch = branchById.get(right.branchId);
      const branchNameDelta = (leftBranch?.name ?? '').localeCompare(
        rightBranch?.name ?? '',
      );
      if (branchNameDelta !== 0) {
        return branchNameDelta;
      }

      return (left.user?.displayName ?? left.user?.email ?? '').localeCompare(
        right.user?.displayName ?? right.user?.email ?? '',
      );
    });

    const rows: AttendanceComplianceRow[] = [];
    let totalExceptionCount = 0;

    for (const assignment of sortedAssignments) {
      const branch = branchById.get(assignment.branchId);
      if (!branch) {
        continue;
      }

      const policy = this.resolvePolicy(
        branch.timezone ?? null,
        entitlement?.metadata?.hrAttendancePolicy ?? null,
      );
      const detailLogs = (
        logsByAssignmentKey.get(
          `${assignment.branchId}:${assignment.userId}`,
        ) ?? []
      ).map((log) =>
        this.mapAttendanceDetailLog(log, policy, now, overrideActorById),
      );
      const currentItem = this.mapAttendanceItem(
        assignment,
        (logsByAssignmentKey.get(
          `${assignment.branchId}:${assignment.userId}`,
        ) ?? [])[0] ?? null,
        policy,
        now,
        windowStart,
      );
      const lastActivityAt =
        detailLogs
          .flatMap((log) => [log.checkInAt, log.checkOutAt].filter(Boolean))
          .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
      const exception = this.mapAttendanceExceptionClassification(currentItem);
      if (exception) {
        totalExceptionCount += 1;
      }

      if (
        statuses &&
        !statuses.has(
          currentItem.attendanceStatus as RetailHrAttendanceComplianceStatusFilter,
        )
      ) {
        continue;
      }

      if (queueTypes && (!exception || !queueTypes.has(exception.queueType))) {
        continue;
      }

      if (priorities && (!exception || !priorities.has(exception.priority))) {
        continue;
      }

      rows.push({
        branch,
        assignment,
        currentItem,
        exception,
        detailLogs,
        lastActivityAt,
        policy,
      });
    }

    return {
      anchorBranch,
      tenantBranches,
      windowHours,
      rows,
      totalStaffCount: sortedAssignments.length,
      totalExceptionCount,
    };
  }

  private buildAttendanceComplianceCountEntries<T extends string>(
    values: T[],
    order: T[],
  ): RetailHrAttendanceComplianceCountEntryResponseDto[] {
    return order.map((key) => ({
      key,
      count: values.filter((value) => value === key).length,
    }));
  }

  private buildAttendanceComplianceBranchSummaries(
    rows: AttendanceComplianceRow[],
  ): RetailHrAttendanceComplianceBranchSummaryResponseDto[] {
    const groupedRows = new Map<number, AttendanceComplianceRow[]>();

    for (const row of rows) {
      const existingRows = groupedRows.get(row.branch.id);
      if (existingRows) {
        existingRows.push(row);
      } else {
        groupedRows.set(row.branch.id, [row]);
      }
    }

    return Array.from(groupedRows.values())
      .map((branchRows) => {
        const branch = branchRows[0].branch;
        const lastActivityAt =
          branchRows
            .map((row) => row.lastActivityAt)
            .filter((value): value is Date => value != null)
            .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

        return {
          branchId: branch.id,
          branchName: branch.name,
          branchCode: branch.code ?? null,
          filteredStaffCount: branchRows.length,
          filteredExceptionCount: branchRows.filter(
            (row) => row.exception != null,
          ).length,
          lastActivityAt,
          statusCounts: this.buildAttendanceComplianceCountEntries(
            branchRows.map((row) => row.currentItem.attendanceStatus),
            ['ABSENT', 'COMPLETED', 'LATE', 'ON_DUTY', 'OVERTIME'],
          ),
          queueTypeCounts: this.buildAttendanceComplianceCountEntries(
            branchRows
              .map((row) => row.exception?.queueType ?? null)
              .filter(
                (value): value is RetailHrAttendanceExceptionQueueFilter =>
                  value != null,
              ),
            [
              RetailHrAttendanceExceptionQueueFilter.ABSENT,
              RetailHrAttendanceExceptionQueueFilter.LATE,
              RetailHrAttendanceExceptionQueueFilter.OVERTIME,
            ],
          ),
          priorityCounts: this.buildAttendanceComplianceCountEntries(
            branchRows
              .map((row) => row.exception?.priority ?? null)
              .filter(
                (value): value is RetailHrAttendanceExceptionPriorityFilter =>
                  value != null,
              ),
            [
              RetailHrAttendanceExceptionPriorityFilter.CRITICAL,
              RetailHrAttendanceExceptionPriorityFilter.HIGH,
              RetailHrAttendanceExceptionPriorityFilter.NORMAL,
            ],
          ),
        };
      })
      .sort((left, right) => {
        const exceptionDelta =
          right.filteredExceptionCount - left.filteredExceptionCount;
        if (exceptionDelta !== 0) {
          return exceptionDelta;
        }

        const staffDelta = right.filteredStaffCount - left.filteredStaffCount;
        if (staffDelta !== 0) {
          return staffDelta;
        }

        return left.branchName.localeCompare(right.branchName);
      });
  }

  private buildAttendanceComplianceTopStaffExceptions(
    rows: AttendanceComplianceRow[],
  ): RetailHrAttendanceComplianceTopStaffExceptionResponseDto[] {
    return rows
      .filter(
        (
          row,
        ): row is AttendanceComplianceRow & {
          exception: AttendanceComplianceClassification;
        } => row.exception != null,
      )
      .map((row) => ({
        branchId: row.branch.id,
        branchName: row.branch.name,
        branchCode: row.branch.code ?? null,
        userId: row.assignment.userId,
        displayName: row.assignment.user?.displayName ?? null,
        email: row.assignment.user?.email ?? '',
        role: row.assignment.role,
        currentStatus: row.currentItem.attendanceStatus,
        queueType: row.exception.queueType,
        priority: row.exception.priority,
        priorityReason: row.exception.priorityReason,
        latestCheckInAt: row.currentItem.latestCheckInAt,
        latestCheckOutAt: row.currentItem.latestCheckOutAt,
        workedHours: row.currentItem.workedHours,
        lateMinutes: row.currentItem.lateMinutes,
        overtimeHours: row.currentItem.overtimeHours,
      }))
      .sort((left, right) =>
        this.compareAttendanceExceptionItem(
          {
            userId: left.userId,
            displayName: left.displayName,
            email: left.email,
            role: left.role,
            queueType: left.queueType,
            priority: left.priority,
            priorityReason: left.priorityReason,
            latestCheckInAt: left.latestCheckInAt,
            latestCheckOutAt: left.latestCheckOutAt,
            workedHours: left.workedHours,
            lateMinutes: left.lateMinutes,
            overtimeHours: left.overtimeHours,
            actions: [],
          },
          {
            userId: right.userId,
            displayName: right.displayName,
            email: right.email,
            role: right.role,
            queueType: right.queueType,
            priority: right.priority,
            priorityReason: right.priorityReason,
            latestCheckInAt: right.latestCheckInAt,
            latestCheckOutAt: right.latestCheckOutAt,
            workedHours: right.workedHours,
            lateMinutes: right.lateMinutes,
            overtimeHours: right.overtimeHours,
            actions: [],
          },
        ),
      );
  }

  private async canOverrideAttendance(
    branchId: number,
    actorUserId: number | null,
    roles: string[],
  ): Promise<boolean> {
    if (
      this.hasAnyRole(roles, [
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.POS_MANAGER,
      ])
    ) {
      return true;
    }

    if (!actorUserId) {
      return false;
    }

    const assignment = await this.branchStaffAssignmentsRepository.findOne({
      where: {
        branchId,
        userId: actorUserId,
        isActive: true,
      },
    });

    if (!assignment) {
      return false;
    }

    const permissions = Array.isArray(assignment.permissions)
      ? assignment.permissions.map((permission) => permission.toUpperCase())
      : [];

    return (
      assignment.role === BranchStaffRole.MANAGER ||
      permissions.includes('HR_ATTENDANCE_OVERRIDE')
    );
  }

  private buildAttendanceExceptionQuery(
    risk: RetailHrAttendanceNetworkBranchResponseDto['highestRisk'],
    lateCheckInCount: number,
    overtimeActiveCount: number,
  ): string {
    if (risk === 'CRITICAL') {
      return '&queueType=ABSENT';
    }

    if (lateCheckInCount > 0) {
      return '&queueType=LATE';
    }

    if (overtimeActiveCount > 0) {
      return '&queueType=OVERTIME';
    }

    return '';
  }

  private matchesAttendanceExceptionQueue(
    queueType: RetailHrAttendanceExceptionQueueFilter,
    filter?: RetailHrAttendanceExceptionQueueFilter,
  ): boolean {
    if (!filter) {
      return true;
    }

    return queueType === filter;
  }

  private matchesAttendanceExceptionPriority(
    priority: RetailHrAttendanceExceptionPriorityFilter,
    filter?: RetailHrAttendanceExceptionPriorityFilter,
  ): boolean {
    if (!filter) {
      return true;
    }

    return priority === filter;
  }

  private compareAttendanceExceptionItem(
    left: RetailHrAttendanceExceptionItemResponseDto,
    right: RetailHrAttendanceExceptionItemResponseDto,
  ): number {
    const severity = { CRITICAL: 0, HIGH: 1, NORMAL: 2 } as Record<
      string,
      number
    >;
    const queueSeverity = { ABSENT: 0, OVERTIME: 1, LATE: 2 } as Record<
      string,
      number
    >;
    const priorityDelta =
      (severity[left.priority] ?? 99) - (severity[right.priority] ?? 99);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const queueDelta =
      (queueSeverity[left.queueType] ?? 99) -
      (queueSeverity[right.queueType] ?? 99);
    if (queueDelta !== 0) {
      return queueDelta;
    }

    if (left.lateMinutes !== right.lateMinutes) {
      return right.lateMinutes - left.lateMinutes;
    }

    if (left.overtimeHours !== right.overtimeHours) {
      return right.overtimeHours - left.overtimeHours;
    }

    return (left.displayName ?? left.email).localeCompare(
      right.displayName ?? right.email,
    );
  }

  private buildAttendanceNetworkAlerts(
    branches: RetailHrAttendanceNetworkBranchResponseDto[],
  ): RetailHrAttendanceNetworkAlertResponseDto[] {
    const alerts: RetailHrAttendanceNetworkAlertResponseDto[] = [];
    const absentBranches = branches.filter((branch) => branch.absentCount > 0);
    if (absentBranches.length > 0) {
      alerts.push({
        code: 'HR_ATTENDANCE_ABSENT_STAFF',
        severity: 'CRITICAL',
        title: 'Active staff are missing attendance activity',
        summary: `${absentBranches.length} branch${absentBranches.length === 1 ? '' : 'es'} have active staff without recent attendance activity.`,
        metric: absentBranches.reduce(
          (sum, branch) => sum + branch.absentCount,
          0,
        ),
        action: 'VIEW_HR_ATTENDANCE',
      });
    }

    const lateBranches = branches.filter(
      (branch) => branch.lateCheckInCount > 0,
    );
    if (lateBranches.length > 0) {
      alerts.push({
        code: 'HR_ATTENDANCE_LATE_CHECK_INS',
        severity: 'WATCH',
        title: 'Late staff check-ins detected',
        summary: `${lateBranches.length} branch${lateBranches.length === 1 ? '' : 'es'} reported late attendance check-ins in the selected window.`,
        metric: lateBranches.reduce(
          (sum, branch) => sum + branch.lateCheckInCount,
          0,
        ),
        action: 'VIEW_HR_ATTENDANCE',
      });
    }

    const overtimeBranches = branches.filter(
      (branch) => branch.overtimeActiveCount > 0,
    );
    if (overtimeBranches.length > 0) {
      alerts.push({
        code: 'HR_ATTENDANCE_OVERTIME_ACTIVE',
        severity: 'WATCH',
        title: 'Overtime is active across the network',
        summary: `${overtimeBranches.length} branch${overtimeBranches.length === 1 ? '' : 'es'} currently have staff beyond the configured overtime threshold.`,
        metric: overtimeBranches.reduce(
          (sum, branch) => sum + branch.overtimeActiveCount,
          0,
        ),
        action: 'VIEW_HR_ATTENDANCE',
      });
    }

    return alerts;
  }

  private matchesAttendanceNetworkRisk(
    risk: RetailHrAttendanceNetworkBranchResponseDto['highestRisk'],
    filter?: RetailHrAttendanceNetworkRiskFilter,
  ): boolean {
    if (!filter) {
      return true;
    }

    return risk === filter;
  }

  private compareAttendanceNetworkBranch(
    left: RetailHrAttendanceNetworkBranchResponseDto,
    right: RetailHrAttendanceNetworkBranchResponseDto,
  ): number {
    const severity = { CRITICAL: 0, HIGH: 1, NORMAL: 2 } as Record<
      string,
      number
    >;
    const severityDelta =
      (severity[left.highestRisk] ?? 99) - (severity[right.highestRisk] ?? 99);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    if (left.absentCount !== right.absentCount) {
      return right.absentCount - left.absentCount;
    }

    if (left.lateCheckInCount !== right.lateCheckInCount) {
      return right.lateCheckInCount - left.lateCheckInCount;
    }

    return left.branchName.localeCompare(right.branchName);
  }

  private async assertActiveAssignment(
    branchId: number,
    actorUserId: number | null,
  ): Promise<BranchStaffAssignment> {
    if (!actorUserId) {
      throw new ForbiddenException(
        'An authenticated branch staff user is required',
      );
    }

    await this.retailEntitlementsService.assertBranchHasModules(branchId, [
      RetailModule.HR_ATTENDANCE,
    ]);

    const assignment = await this.branchStaffAssignmentsRepository.findOne({
      where: {
        branchId,
        userId: actorUserId,
        isActive: true,
      },
      relations: {
        user: true,
      },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'The current user does not have an active branch staff assignment for this branch',
      );
    }

    return assignment;
  }

  private async assertTargetAssignment(
    branchId: number,
    targetUserId: number,
  ): Promise<BranchStaffAssignment> {
    const assignment = await this.branchStaffAssignmentsRepository.findOne({
      where: {
        branchId,
        userId: targetUserId,
        isActive: true,
      },
      relations: {
        user: true,
      },
    });

    if (!assignment) {
      throw new BadRequestException(
        'Target user does not have an active branch staff assignment for this branch',
      );
    }

    return assignment;
  }

  private async assertOverrideAuthority(
    branchId: number,
    actorUserId: number | null,
    roles: string[],
  ): Promise<void> {
    await this.retailEntitlementsService.assertBranchHasModules(branchId, [
      RetailModule.HR_ATTENDANCE,
    ]);

    if (await this.canOverrideAttendance(branchId, actorUserId, roles)) {
      return;
    }

    throw new ForbiddenException(
      'The current user does not have authority to override attendance for this branch',
    );
  }

  private hasAnyRole(roles: string[], allowedRoles: UserRole[]): boolean {
    return allowedRoles.some((role) => roles.includes(role));
  }

  private escapeCsvValue(value: unknown): string {
    const normalized = value == null ? '' : String(value);
    const escaped = normalized.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  private formatCsvDate(value: Date | string | null | undefined): string {
    if (!value) {
      return '';
    }

    return this.escapeCsvValue(new Date(value).toISOString());
  }

  private resolvePolicy(
    branchTimeZone: string | null,
    rawPolicy: Record<string, any> | null,
  ): RetailHrAttendancePolicyResponseDto {
    return {
      shiftStartHour: this.normalizePolicyInteger(rawPolicy?.shiftStartHour, 8),
      shiftEndHour: this.normalizePolicyInteger(rawPolicy?.shiftEndHour, 17),
      gracePeriodMinutes: this.normalizePolicyInteger(
        rawPolicy?.gracePeriodMinutes,
        15,
      ),
      overtimeThresholdHours: this.normalizePolicyInteger(
        rawPolicy?.overtimeThresholdHours,
        9,
      ),
      timeZone:
        typeof rawPolicy?.timeZone === 'string' &&
        rawPolicy.timeZone.trim().length > 0
          ? rawPolicy.timeZone.trim()
          : branchTimeZone?.trim() || 'UTC',
    };
  }

  private normalizePolicyInteger(value: unknown, fallback: number): number {
    if (value == null) {
      return fallback;
    }

    const normalizedValue = Number(value);
    return Number.isInteger(normalizedValue) ? normalizedValue : fallback;
  }

  private getMinutesInTimeZone(date: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
    const minute = Number(
      parts.find((part) => part.type === 'minute')?.value ?? 0,
    );
    return hour * 60 + minute;
  }

  private normalizeOptionalNumber(value: unknown): number | null {
    if (value == null || value === '') {
      return null;
    }

    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }
}
