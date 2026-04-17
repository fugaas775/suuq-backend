import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import {
  GetBillInterventionsDto,
  ReopenSettledBillDto,
  SplitOpenBillDto,
  VoidSettledBillDto,
} from './dto/bill-actions.dto';
import {
  GetKitchenQueueDto,
  HospitalityTicketActionDto,
  PosHospitalityServiceFormat,
  PosKitchenTicketState,
} from './dto/kitchen-queue.dto';
import {
  AssignTableOwnerDto,
  GetTableBoardDto,
  PosTableStatus,
  UpdateTableStatusDto,
} from './dto/table-board.dto';
import { HospitalityBillIntervention } from './entities/hospitality-bill-intervention.entity';
import { HospitalityIdempotencyKey } from './entities/hospitality-idempotency-key.entity';
import { HospitalityKitchenTicket } from './entities/hospitality-kitchen-ticket.entity';
import { HospitalityTableBoard } from './entities/hospitality-table-board.entity';

type ActorSummary = { id?: number | null; email?: string | null };

@Injectable()
export class HospitalityWorkflowsService {
  constructor(
    @InjectRepository(HospitalityKitchenTicket)
    private readonly kitchenTicketRepo: Repository<HospitalityKitchenTicket>,
    @InjectRepository(HospitalityTableBoard)
    private readonly tableBoardRepo: Repository<HospitalityTableBoard>,
    @InjectRepository(HospitalityBillIntervention)
    private readonly billInterventionRepo: Repository<HospitalityBillIntervention>,
    @InjectRepository(HospitalityIdempotencyKey)
    private readonly idempotencyRepo: Repository<HospitalityIdempotencyKey>,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  private actorDisplay(actor?: ActorSummary) {
    return actor?.email || null;
  }

  private nextTimestamp() {
    return new Date();
  }

  private toIsoString(value?: Date | string | null) {
    if (!value) {
      return null;
    }

    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }

  private normalizeTableId(tableId: string) {
    const normalizedTableId = String(tableId || '')
      .trim()
      .toUpperCase();

    if (!normalizedTableId) {
      throw new BadRequestException('Table ID is required.');
    }

    return normalizedTableId;
  }

  private normalizeBillId(billId: string) {
    const normalizedBillId = String(billId || '').trim();

    if (!normalizedBillId) {
      throw new BadRequestException('Bill ID is required.');
    }

    return normalizedBillId;
  }

  private normalizeCurrency(value?: string | null) {
    return String(value || 'ETB')
      .trim()
      .toUpperCase();
  }

  private normalizeCourseSummary(value?: Record<string, unknown> | null) {
    const current = value && typeof value === 'object' ? value : {};
    return {
      ordered: Number(current.ordered ?? 0) || 0,
      fired: Number(current.fired ?? 0) || 0,
      ready: Number(current.ready ?? 0) || 0,
      served: Number(current.served ?? 0) || 0,
    };
  }

  private normalizeActiveBills(value?: Array<Record<string, unknown>> | null) {
    return (Array.isArray(value) ? value : []).map((item) => ({
      billId: String(item?.billId || '').trim(),
      billLabel: String(item?.billLabel || item?.billId || '').trim(),
      status: String(item?.status || 'OPEN')
        .trim()
        .toUpperCase(),
      itemCount: Number(item?.itemCount ?? 0) || 0,
      grandTotal: Number(item?.grandTotal ?? 0) || 0,
      currency: this.normalizeCurrency(String(item?.currency || 'ETB')),
    }));
  }

  private mapKitchenTicket(ticket: HospitalityKitchenTicket) {
    return {
      ticketId: ticket.ticketId,
      branchId: ticket.branchId,
      serviceFormat: ticket.serviceFormat,
      stationCode: ticket.stationCode,
      stationLabel: ticket.stationLabel,
      state: ticket.state,
      queuedAt: this.toIsoString(ticket.queuedAt),
      firedAt: this.toIsoString(ticket.firedAt),
      readyAt: this.toIsoString(ticket.readyAt),
      handedOffAt: this.toIsoString(ticket.handedOffAt),
      ticketLabel: ticket.ticketLabel,
      receiptId: ticket.receiptId,
      serviceOwner: ticket.serviceOwner,
      tableId: ticket.tableId,
      tableLabel: ticket.tableLabel,
      billId: ticket.billId,
      billLabel: ticket.billLabel,
      lines: Array.isArray(ticket.lines) ? ticket.lines : [],
      updatedBy: {
        userId: ticket.updatedByUserId,
        displayName: ticket.updatedByDisplayName,
      },
      updatedAt: this.toIsoString(ticket.updatedAt),
      version: ticket.version,
      lastActionReason: ticket.lastActionReason,
    };
  }

  private mapTableBoard(table: HospitalityTableBoard) {
    return {
      tableId: table.tableId,
      branchId: table.branchId,
      tableLabel: table.tableLabel,
      areaCode: table.areaCode,
      status: table.status,
      seatCount: table.seatCount,
      owner: {
        userId: table.ownerUserId,
        displayName: table.ownerDisplayName,
        reference: table.ownerReference,
      },
      activeGuestCount: table.activeGuestCount,
      activeBills: this.normalizeActiveBills(table.activeBills),
      courseSummary: this.normalizeCourseSummary(table.courseSummary),
      updatedAt: this.toIsoString(table.updatedAt),
      version: table.version,
    };
  }

  private mapBillIntervention(item: HospitalityBillIntervention) {
    return {
      interventionId: item.interventionId,
      branchId: item.branchId,
      billId: item.billId,
      billLabel: item.billLabel,
      tableId: item.tableId,
      tableLabel: item.tableLabel,
      receiptId: item.receiptId,
      receiptNumber: item.receiptNumber,
      actionType: item.actionType,
      lifecycleStatus: item.lifecycleStatus,
      serviceOwner: item.serviceOwner,
      itemCount: item.itemCount,
      total: Number(item.total || 0),
      currency: item.currency,
      reason: item.reason,
      priority: item.priority,
      createdAt: this.toIsoString(item.createdAt),
      updatedAt: this.toIsoString(item.updatedAt),
      actor: {
        userId: item.actorUserId,
        displayName: item.actorDisplayName,
      },
      version: item.version,
    };
  }

  private async getIdempotencyResult(
    branchId: number,
    key?: string,
    manager?: EntityManager,
  ) {
    const normalizedKey = String(key || '').trim();

    if (!normalizedKey) {
      return null;
    }

    const repo =
      manager?.getRepository(HospitalityIdempotencyKey) ?? this.idempotencyRepo;
    const record = await repo.findOne({
      where: {
        branchId,
        idempotencyKey: normalizedKey,
      },
    });

    return record?.responsePayload ?? null;
  }

  private async saveIdempotencyResult(
    manager: EntityManager,
    branchId: number,
    key: string,
    value: Record<string, unknown>,
  ) {
    const normalizedKey = String(key || '').trim();

    if (!normalizedKey) {
      return;
    }

    const repo = manager.getRepository(HospitalityIdempotencyKey);
    const existing = await repo.findOne({
      where: {
        branchId,
        idempotencyKey: normalizedKey,
      },
    });

    const record = repo.create({
      ...(existing || {}),
      branchId,
      idempotencyKey: normalizedKey,
      responsePayload: value,
    });
    await repo.save(record);
  }

  private resolveTicketState(action: string) {
    switch (
      String(action || '')
        .trim()
        .toLowerCase()
    ) {
      case 'fire':
        return PosKitchenTicketState.FIRED;
      case 'hold':
        return PosKitchenTicketState.HELD;
      case 'ready':
        return PosKitchenTicketState.READY;
      case 'handoff':
        return PosKitchenTicketState.HANDED_OFF;
      default:
        throw new BadRequestException(`Unsupported kitchen action: ${action}`);
    }
  }

  private assertTicketTransition(
    ticket: { state: PosKitchenTicketState },
    nextState: PosKitchenTicketState,
  ) {
    const allowedTransitions: Record<
      PosKitchenTicketState,
      PosKitchenTicketState[]
    > = {
      [PosKitchenTicketState.PENDING]: [
        PosKitchenTicketState.HELD,
        PosKitchenTicketState.FIRED,
      ],
      [PosKitchenTicketState.HELD]: [PosKitchenTicketState.FIRED],
      [PosKitchenTicketState.FIRED]: [
        PosKitchenTicketState.HELD,
        PosKitchenTicketState.READY,
      ],
      [PosKitchenTicketState.READY]: [PosKitchenTicketState.HANDED_OFF],
      [PosKitchenTicketState.HANDED_OFF]: [],
    };

    if (!allowedTransitions[ticket.state].includes(nextState)) {
      throw new UnprocessableEntityException({
        code: 'POS_KITCHEN_STATE_INVALID',
        message: `Cannot move kitchen ticket from ${ticket.state} to ${nextState}.`,
      });
    }
  }

  private async ensureKitchenTicket(
    manager: EntityManager,
    branchId: number,
    ticketId: string,
    dto: HospitalityTicketActionDto,
    actor?: ActorSummary,
  ) {
    const repo = manager.getRepository(HospitalityKitchenTicket);
    const normalizedTicketId = String(ticketId || '').trim();

    if (!normalizedTicketId) {
      throw new BadRequestException('Kitchen ticket ID is required.');
    }

    let ticket =
      (await repo.findOne({
        where: {
          branchId,
          ticketId: normalizedTicketId,
        },
      })) ?? null;

    if (!ticket) {
      const now = this.nextTimestamp();
      ticket = repo.create({
        ticketId: normalizedTicketId,
        branchId,
        serviceFormat: (dto.serviceFormat ||
          PosHospitalityServiceFormat.QSR) as 'QSR' | 'FSR',
        stationCode: String(dto.stationCode || 'EXPO')
          .trim()
          .toUpperCase(),
        stationLabel: String(
          dto.stationLabel || dto.stationCode || 'Expo',
        ).trim(),
        state: PosKitchenTicketState.PENDING,
        queuedAt: now,
        firedAt: null,
        readyAt: null,
        handedOffAt: null,
        ticketLabel: String(dto.ticketLabel || normalizedTicketId).trim(),
        receiptId: dto.receiptId || null,
        serviceOwner: dto.serviceOwner || null,
        tableId: dto.tableId || null,
        tableLabel: dto.tableLabel || null,
        billId: dto.billId || null,
        billLabel: dto.billLabel || null,
        lines: Array.isArray(dto.lines) ? dto.lines : [],
        updatedAt: now,
        updatedByUserId: actor?.id ?? null,
        updatedByDisplayName: this.actorDisplay(actor),
        version: 1,
        lastActionReason: null,
      });
    }

    return ticket;
  }

  private async ensureTableRecord(
    manager: EntityManager,
    branchId: number,
    tableId: string,
    seed: { tableLabel?: string; areaCode?: string } = {},
  ) {
    const repo = manager.getRepository(HospitalityTableBoard);
    const normalizedTableId = this.normalizeTableId(tableId);
    let table =
      (await repo.findOne({
        where: {
          branchId,
          tableId: normalizedTableId,
        },
      })) ?? null;

    if (!table) {
      table = repo.create({
        branchId,
        tableId: normalizedTableId,
        tableLabel: String(seed.tableLabel || normalizedTableId).trim(),
        areaCode: String(seed.areaCode || 'MAIN_ROOM')
          .trim()
          .toUpperCase(),
        status: PosTableStatus.OPEN,
        seatCount: 4,
        ownerUserId: null,
        ownerReference: null,
        ownerDisplayName: null,
        activeGuestCount: 0,
        activeBills: [],
        courseSummary: this.normalizeCourseSummary(),
        version: 1,
      });
    }

    if (seed.tableLabel) {
      table.tableLabel = String(seed.tableLabel).trim();
    }
    if (seed.areaCode) {
      table.areaCode = String(seed.areaCode).trim().toUpperCase();
    }

    return table;
  }

  private mergeActiveBill(
    table: HospitalityTableBoard,
    nextBill: {
      billId: string;
      billLabel: string;
      status: string;
      itemCount: number;
      grandTotal: number;
      currency: string;
    },
  ) {
    const activeBills = this.normalizeActiveBills(table.activeBills);
    const existingBillIndex = activeBills.findIndex(
      (item) => item.billId === nextBill.billId,
    );

    if (existingBillIndex === -1) {
      activeBills.push(nextBill);
    } else {
      activeBills[existingBillIndex] = nextBill;
    }

    table.activeBills = activeBills;
  }

  private async upsertBillIntervention(
    manager: EntityManager,
    branchId: number,
    billId: string,
    actionType: 'REOPEN' | 'VOID' | 'SPLIT',
    payload: ReopenSettledBillDto | VoidSettledBillDto | SplitOpenBillDto,
    actor?: ActorSummary,
  ) {
    const interventionRepo = manager.getRepository(HospitalityBillIntervention);
    const tableRepo = manager.getRepository(HospitalityTableBoard);
    const normalizedBillId = this.normalizeBillId(billId);
    const now = this.nextTimestamp();
    const current = await interventionRepo.findOne({
      where: {
        branchId,
        billId: normalizedBillId,
      },
    });
    const splitPayload =
      actionType === 'SPLIT' ? (payload as SplitOpenBillDto) : null;
    const lifecycleStatus =
      actionType === 'VOID'
        ? 'VOIDED'
        : actionType === 'REOPEN'
          ? 'REOPENED'
          : 'OPEN';

    const intervention = interventionRepo.create({
      ...(current || {}),
      interventionId:
        current?.interventionId || `bill-int-${branchId}-${normalizedBillId}`,
      branchId,
      billId: normalizedBillId,
      billLabel: payload.billLabel || current?.billLabel || normalizedBillId,
      tableId: payload.tableId || current?.tableId || null,
      tableLabel: payload.tableLabel || current?.tableLabel || null,
      receiptId: payload.receiptId || current?.receiptId || null,
      receiptNumber: payload.receiptNumber || current?.receiptNumber || null,
      actionType,
      lifecycleStatus,
      serviceOwner: payload.serviceOwner || current?.serviceOwner || null,
      itemCount: Number(payload.itemCount ?? current?.itemCount ?? 0) || 0,
      total: String(Number(payload.total ?? current?.total ?? 0) || 0),
      currency: String(payload.currency || current?.currency || 'ETB')
        .trim()
        .toUpperCase(),
      reason: payload.reason || current?.reason || null,
      priority: actionType === 'VOID' ? 'CRITICAL' : 'HIGH',
      actorUserId: actor?.id ?? null,
      actorDisplayName: this.actorDisplay(actor),
      version: current ? current.version + 1 : 1,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    });
    const savedIntervention = await interventionRepo.save(intervention);

    if (savedIntervention.tableId) {
      const table = await this.ensureTableRecord(
        manager,
        branchId,
        savedIntervention.tableId,
        {
          tableLabel: savedIntervention.tableLabel || undefined,
        },
      );
      table.tableLabel = savedIntervention.tableLabel || table.tableLabel;
      this.mergeActiveBill(table, {
        billId: normalizedBillId,
        billLabel: savedIntervention.billLabel,
        status: savedIntervention.lifecycleStatus,
        itemCount: savedIntervention.itemCount,
        grandTotal: Number(savedIntervention.total || 0),
        currency: savedIntervention.currency,
      });

      if (actionType === 'SPLIT') {
        const splitVersion = current ? current.version + 1 : 1;
        this.mergeActiveBill(table, {
          billId: `${normalizedBillId}-SPLIT-${splitVersion}`,
          billLabel: splitPayload?.targetBillLabel || `Split ${splitVersion}`,
          status: 'OPEN',
          itemCount: Array.isArray(splitPayload?.lineIds)
            ? splitPayload.lineIds.length
            : 0,
          grandTotal:
            Number(payload.total ?? savedIntervention.total ?? 0) || 0,
          currency: this.normalizeCurrency(
            payload.currency || savedIntervention.currency,
          ),
        });
      }

      table.updatedAt = now;
      table.version += 1;
      await tableRepo.save(table);
    }

    return savedIntervention;
  }

  async getKitchenQueue(branchId: number, query: GetKitchenQueueDto) {
    const qb = this.kitchenTicketRepo
      .createQueryBuilder('ticket')
      .where('ticket.branchId = :branchId', { branchId });

    if (query.stationCode) {
      qb.andWhere('ticket.stationCode = :stationCode', {
        stationCode: String(query.stationCode).trim().toUpperCase(),
      });
    }

    if (query.state) {
      qb.andWhere('ticket.state = :state', { state: query.state });
    }

    if (query.serviceFormat) {
      qb.andWhere('ticket.serviceFormat = :serviceFormat', {
        serviceFormat: query.serviceFormat,
      });
    }

    const tickets = await qb
      .orderBy('ticket.updatedAt', 'DESC')
      .take(Number(query.limit || 50))
      .getMany();

    return {
      branchId,
      generatedAt: this.nextTimestamp().toISOString(),
      tickets: tickets.map((ticket) => this.mapKitchenTicket(ticket)),
      nextCursor: null,
      filters: query,
    };
  }

  async mutateKitchenTicket(
    branchId: number,
    ticketId: string,
    action: string,
    dto: HospitalityTicketActionDto,
    actor?: { id?: number | null; email?: string | null },
  ) {
    const existing = await this.getIdempotencyResult(
      branchId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }

    const nextState = this.resolveTicketState(action);
    return this.dataSource.transaction(async (manager) => {
      const retry = await this.getIdempotencyResult(
        branchId,
        dto.idempotencyKey,
        manager,
      );
      if (retry) {
        return retry;
      }

      const ticket = await this.ensureKitchenTicket(
        manager,
        branchId,
        ticketId,
        dto,
        actor,
      );
      const previousState = ticket.state;
      this.assertTicketTransition(ticket as any, nextState);

      const now = this.nextTimestamp();
      ticket.state = nextState;
      if (nextState === PosKitchenTicketState.FIRED) {
        ticket.firedAt = now;
      }
      if (nextState === PosKitchenTicketState.READY) {
        ticket.readyAt = now;
      }
      if (nextState === PosKitchenTicketState.HANDED_OFF) {
        ticket.handedOffAt = now;
      }
      ticket.updatedAt = now;
      ticket.version += 1;
      ticket.lastActionReason = dto.reason || null;
      ticket.updatedByUserId = actor?.id ?? null;
      ticket.updatedByDisplayName = this.actorDisplay(actor);

      const savedTicket = await manager
        .getRepository(HospitalityKitchenTicket)
        .save(ticket);
      const mappedTicket = this.mapKitchenTicket(savedTicket);
      const response = {
        status: 'UPDATED',
        branchId,
        ticket: mappedTicket,
        actor: actor || null,
        request: dto,
      };

      await this.saveIdempotencyResult(
        manager,
        branchId,
        dto.idempotencyKey,
        response,
      );
      await this.auditService.log(
        {
          actorId: actor?.id ?? null,
          actorEmail: actor?.email ?? null,
          action: `pos.hospitality.kitchen.${String(action || '')
            .trim()
            .toLowerCase()}`,
          targetType: 'pos_hospitality_kitchen_ticket',
          targetId: savedTicket.id,
          reason: dto.reason || null,
          meta: {
            branchId,
            ticketId: savedTicket.ticketId,
            stationCode: savedTicket.stationCode,
            previousState,
            nextState: savedTicket.state,
            serviceFormat: savedTicket.serviceFormat,
          },
        },
        manager,
      );

      return response;
    });
  }

  async getTableBoard(branchId: number, query: GetTableBoardDto) {
    const qb = this.tableBoardRepo
      .createQueryBuilder('table')
      .where('table.branchId = :branchId', { branchId });

    if (query.areaCode) {
      qb.andWhere('table.areaCode = :areaCode', {
        areaCode: String(query.areaCode).trim().toUpperCase(),
      });
    }

    if (query.status) {
      qb.andWhere('table.status = :status', { status: query.status });
    }

    if (query.ownerUserId != null) {
      qb.andWhere('table.ownerUserId = :ownerUserId', {
        ownerUserId: query.ownerUserId,
      });
    }

    if (query.ownerReference) {
      qb.andWhere('table.ownerReference ILIKE :ownerReference', {
        ownerReference: `%${String(query.ownerReference).trim()}%`,
      });
    }

    if (query.ownerLabel) {
      qb.andWhere(
        '(table.ownerDisplayName ILIKE :ownerLabel OR table.ownerReference ILIKE :ownerLabel)',
        {
          ownerLabel: `%${String(query.ownerLabel).trim()}%`,
        },
      );
    }

    const tables = await qb.orderBy('table.tableLabel', 'ASC').getMany();

    return {
      branchId,
      generatedAt: this.nextTimestamp().toISOString(),
      tables: tables.map((table) => this.mapTableBoard(table)),
      filters: query,
    };
  }

  async getBillInterventions(branchId: number, query: GetBillInterventionsDto) {
    const qb = this.billInterventionRepo
      .createQueryBuilder('bill')
      .where('bill.branchId = :branchId', { branchId });

    if (query.actionType) {
      qb.andWhere('bill.actionType = :actionType', {
        actionType: query.actionType,
      });
    }

    if (query.priority) {
      qb.andWhere('bill.priority = :priority', {
        priority: query.priority,
      });
    }

    const items = await qb
      .orderBy('bill.updatedAt', 'DESC')
      .take(Number(query.limit || 50))
      .getMany();

    return {
      branchId,
      generatedAt: this.nextTimestamp().toISOString(),
      items: items.map((item) => this.mapBillIntervention(item)),
      total: items.length,
      filters: query,
    };
  }

  async updateTableStatus(
    branchId: number,
    tableId: string,
    dto: UpdateTableStatusDto,
    actor?: { id?: number | null; email?: string | null },
  ) {
    const existing = await this.getIdempotencyResult(
      branchId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }

    return this.dataSource.transaction(async (manager) => {
      const retry = await this.getIdempotencyResult(
        branchId,
        dto.idempotencyKey,
        manager,
      );
      if (retry) {
        return retry;
      }

      const table = await this.ensureTableRecord(manager, branchId, tableId, {
        tableLabel: dto.tableLabel,
        areaCode: dto.areaCode,
      });
      const previousStatus = table.status;
      table.status = dto.nextStatus;
      table.updatedAt = this.nextTimestamp();
      table.version += 1;

      const savedTable = await manager
        .getRepository(HospitalityTableBoard)
        .save(table);
      const mappedTable = this.mapTableBoard(savedTable);
      const response = {
        status: 'UPDATED',
        branchId,
        table: mappedTable,
        actor: actor || null,
        request: dto,
      };

      await this.saveIdempotencyResult(
        manager,
        branchId,
        dto.idempotencyKey,
        response,
      );
      await this.auditService.log(
        {
          actorId: actor?.id ?? null,
          actorEmail: actor?.email ?? null,
          action: 'pos.hospitality.table.status.update',
          targetType: 'pos_hospitality_table_board',
          targetId: savedTable.id,
          reason: dto.reason || null,
          meta: {
            branchId,
            tableId: savedTable.tableId,
            previousStatus,
            nextStatus: savedTable.status,
          },
        },
        manager,
      );

      return response;
    });
  }

  async assignTableOwner(
    branchId: number,
    tableId: string,
    dto: AssignTableOwnerDto,
    actor?: { id?: number | null; email?: string | null },
  ) {
    const existing = await this.getIdempotencyResult(
      branchId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }

    if (dto.ownerUserId == null && !dto.ownerReference && !dto.ownerLabel) {
      throw new BadRequestException(
        'A table owner reference, label, or user ID is required.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const retry = await this.getIdempotencyResult(
        branchId,
        dto.idempotencyKey,
        manager,
      );
      if (retry) {
        return retry;
      }

      const table = await this.ensureTableRecord(manager, branchId, tableId, {
        tableLabel: dto.tableLabel,
        areaCode: dto.areaCode,
      });
      const previousOwner = {
        userId: table.ownerUserId,
        displayName: table.ownerDisplayName,
        reference: table.ownerReference,
      };
      table.ownerUserId = dto.ownerUserId ?? null;
      table.ownerReference = dto.ownerReference || dto.ownerLabel || null;
      table.ownerDisplayName =
        dto.ownerLabel ||
        dto.ownerReference ||
        this.actorDisplay(actor) ||
        (dto.ownerUserId != null ? `User ${dto.ownerUserId}` : null);
      table.updatedAt = this.nextTimestamp();
      table.version += 1;

      const savedTable = await manager
        .getRepository(HospitalityTableBoard)
        .save(table);
      const mappedTable = this.mapTableBoard(savedTable);
      const response = {
        status: 'UPDATED',
        branchId,
        table: mappedTable,
        actor: actor || null,
        request: dto,
      };

      await this.saveIdempotencyResult(
        manager,
        branchId,
        dto.idempotencyKey,
        response,
      );
      await this.auditService.log(
        {
          actorId: actor?.id ?? null,
          actorEmail: actor?.email ?? null,
          action: 'pos.hospitality.table.owner.assign',
          targetType: 'pos_hospitality_table_board',
          targetId: savedTable.id,
          reason: dto.reason || null,
          meta: {
            branchId,
            tableId: savedTable.tableId,
            previousOwner,
            nextOwner: mappedTable.owner,
          },
        },
        manager,
      );

      return response;
    });
  }

  async splitOpenBill(
    branchId: number,
    billId: string,
    dto: SplitOpenBillDto,
    actor?: { id?: number | null; email?: string | null },
  ) {
    const existing = await this.getIdempotencyResult(
      branchId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }

    return this.dataSource.transaction(async (manager) => {
      const retry = await this.getIdempotencyResult(
        branchId,
        dto.idempotencyKey,
        manager,
      );
      if (retry) {
        return retry;
      }

      const intervention = await this.upsertBillIntervention(
        manager,
        branchId,
        billId,
        'SPLIT',
        dto,
        actor,
      );
      const targetBillId = `${this.normalizeBillId(billId)}-SPLIT-${intervention.version}`;
      const response = {
        status: 'SPLIT',
        branchId,
        sourceBill: {
          billId: intervention.billId,
          billLabel: intervention.billLabel,
          itemCount: intervention.itemCount,
          grandTotal: Number(intervention.total || 0),
          currency: intervention.currency,
        },
        targetBill: {
          billId: targetBillId,
          billLabel: dto.targetBillLabel || `Split ${intervention.version}`,
          itemCount: dto.lineIds.length,
          grandTotal: Number(dto.total ?? intervention.total ?? 0) || 0,
          currency: this.normalizeCurrency(
            dto.currency || intervention.currency,
          ),
        },
        intervention: this.mapBillIntervention(intervention),
        actor: actor || null,
      };

      await this.saveIdempotencyResult(
        manager,
        branchId,
        dto.idempotencyKey,
        response,
      );
      await this.auditService.log(
        {
          actorId: actor?.id ?? null,
          actorEmail: actor?.email ?? null,
          action: 'pos.hospitality.bill.split',
          targetType: 'pos_hospitality_bill_intervention',
          targetId: intervention.id,
          reason: dto.reason || null,
          meta: {
            branchId,
            billId: intervention.billId,
            targetBillId,
            lineIds: dto.lineIds,
          },
        },
        manager,
      );

      return response;
    });
  }

  async reopenSettledBill(
    branchId: number,
    billId: string,
    dto: ReopenSettledBillDto,
    actor?: { id?: number | null; email?: string | null },
  ) {
    const existing = await this.getIdempotencyResult(
      branchId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }

    if (!dto.confirmed) {
      throw new ConflictException(
        'Settled bill reopen requires explicit confirmation.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const retry = await this.getIdempotencyResult(
        branchId,
        dto.idempotencyKey,
        manager,
      );
      if (retry) {
        return retry;
      }

      const currentIntervention = await manager
        .getRepository(HospitalityBillIntervention)
        .findOne({
          where: {
            branchId,
            billId: this.normalizeBillId(billId),
          },
        });

      if (currentIntervention?.lifecycleStatus === 'VOIDED') {
        throw new NotFoundException(
          'A voided bill cannot be reopened back into the lane.',
        );
      }

      const intervention = await this.upsertBillIntervention(
        manager,
        branchId,
        billId,
        'REOPEN',
        dto,
        actor,
      );
      const response = {
        status: 'UPDATED',
        branchId,
        bill: {
          billId: intervention.billId,
          billLabel: intervention.billLabel,
          lifecycleStatus: 'ACTIVE',
          updatedAt: this.toIsoString(intervention.updatedAt),
        },
        receipt: {
          receiptId: intervention.receiptId,
          receiptNumber: intervention.receiptNumber,
          lifecycleStatus: 'REOPENED',
        },
        intervention: this.mapBillIntervention(intervention),
        actor: actor || null,
      };

      await this.saveIdempotencyResult(
        manager,
        branchId,
        dto.idempotencyKey,
        response,
      );
      await this.auditService.log(
        {
          actorId: actor?.id ?? null,
          actorEmail: actor?.email ?? null,
          action: 'pos.hospitality.bill.reopen',
          targetType: 'pos_hospitality_bill_intervention',
          targetId: intervention.id,
          reason: dto.reason || null,
          meta: {
            branchId,
            billId: intervention.billId,
            receiptId: intervention.receiptId,
            receiptNumber: intervention.receiptNumber,
          },
        },
        manager,
      );

      return response;
    });
  }

  async voidSettledBill(
    branchId: number,
    billId: string,
    dto: VoidSettledBillDto,
    actor?: { id?: number | null; email?: string | null },
  ) {
    const existing = await this.getIdempotencyResult(
      branchId,
      dto.idempotencyKey,
    );
    if (existing) {
      return existing;
    }

    if (!dto.confirmed) {
      throw new ConflictException(
        'Settled bill void requires explicit confirmation.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const retry = await this.getIdempotencyResult(
        branchId,
        dto.idempotencyKey,
        manager,
      );
      if (retry) {
        return retry;
      }

      const intervention = await this.upsertBillIntervention(
        manager,
        branchId,
        billId,
        'VOID',
        dto,
        actor,
      );
      const response = {
        status: 'UPDATED',
        branchId,
        bill: {
          billId: intervention.billId,
          billLabel: intervention.billLabel,
          lifecycleStatus: 'VOIDED',
          updatedAt: this.toIsoString(intervention.updatedAt),
        },
        receipt: {
          receiptId: intervention.receiptId,
          receiptNumber: intervention.receiptNumber,
          lifecycleStatus: 'VOIDED',
        },
        intervention: this.mapBillIntervention(intervention),
        actor: actor || null,
      };

      await this.saveIdempotencyResult(
        manager,
        branchId,
        dto.idempotencyKey,
        response,
      );
      await this.auditService.log(
        {
          actorId: actor?.id ?? null,
          actorEmail: actor?.email ?? null,
          action: 'pos.hospitality.bill.void',
          targetType: 'pos_hospitality_bill_intervention',
          targetId: intervention.id,
          reason: dto.reason || null,
          meta: {
            branchId,
            billId: intervention.billId,
            receiptId: intervention.receiptId,
            receiptNumber: intervention.receiptNumber,
          },
        },
        manager,
      );

      return response;
    });
  }
}
