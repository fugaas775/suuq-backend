import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HotelRoom, HotelRoomStatus } from './entities/hotel-room.entity';
import { HotelRatePlan } from './entities/hotel-rate-plan.entity';
import {
  HotelReservation,
  HotelReservationStatus,
} from './entities/hotel-reservation.entity';
import { HotelFolio, HotelFolioStatus } from './entities/hotel-folio.entity';
import { HotelFolioCharge } from './entities/hotel-folio-charge.entity';
import { HotelNightAuditLog } from './entities/hotel-night-audit-log.entity';
import {
  CreateHotelRatePlanDto,
  CreateHotelReservationDto,
  CreateHotelRoomDto,
  ListHotelRatePlansQueryDto,
  ListHotelReservationsQueryDto,
  ListHotelRoomsQueryDto,
  ListNightAuditLogsQueryDto,
  TriggerNightAuditDto,
  UpdateHotelReservationDto,
  UpdateHotelRoomDto,
} from './dto/hotel-rooms-reservations.dto';

type ActorSummary = { id?: number | null; email?: string | null };

@Injectable()
export class HotelInventoryService {
  constructor(
    @InjectRepository(HotelRoom)
    private readonly roomRepo: Repository<HotelRoom>,
    @InjectRepository(HotelRatePlan)
    private readonly ratePlanRepo: Repository<HotelRatePlan>,
    @InjectRepository(HotelReservation)
    private readonly reservationRepo: Repository<HotelReservation>,
    @InjectRepository(HotelFolio)
    private readonly folioRepo: Repository<HotelFolio>,
    @InjectRepository(HotelFolioCharge)
    private readonly chargeRepo: Repository<HotelFolioCharge>,
    @InjectRepository(HotelNightAuditLog)
    private readonly auditLogRepo: Repository<HotelNightAuditLog>,
  ) {}

  // ── Rooms ────────────────────────────────────────────────────────────────

  private toRoomResponse(r: HotelRoom) {
    return {
      id: r.id,
      branchId: r.branchId,
      roomNumber: r.roomNumber,
      roomType: r.roomType,
      floor: r.floor,
      maxOccupancy: r.maxOccupancy,
      description: r.description,
      status: r.status,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async listRooms(query: ListHotelRoomsQueryDto) {
    const where: Partial<HotelRoom> = { branchId: query.branchId };
    if (query.status) where.status = query.status;
    if (query.roomType) where.roomType = query.roomType.trim().toUpperCase();

    const rooms = await this.roomRepo.find({
      where,
      order: { roomNumber: 'ASC' },
    });
    return { items: rooms.map((r) => this.toRoomResponse(r)) };
  }

  async createRoom(dto: CreateHotelRoomDto) {
    const existing = await this.roomRepo.findOne({
      where: {
        branchId: dto.branchId,
        roomNumber: dto.roomNumber.trim(),
      },
    });
    if (existing) {
      throw new ConflictException(
        `Room ${dto.roomNumber} already exists for this branch.`,
      );
    }

    const room = this.roomRepo.create({
      branchId: dto.branchId,
      roomNumber: dto.roomNumber.trim(),
      roomType: dto.roomType?.trim().toUpperCase() ?? null,
      floor: dto.floor ?? null,
      maxOccupancy: dto.maxOccupancy ?? 2,
      description: dto.description ?? null,
      status: dto.status ?? HotelRoomStatus.ACTIVE,
    });

    const saved = await this.roomRepo.save(room);
    return this.toRoomResponse(saved);
  }

  async updateRoom(id: number, dto: UpdateHotelRoomDto) {
    const room = await this.roomRepo.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!room) throw new NotFoundException(`Room ${id} not found.`);

    if (dto.roomType !== undefined)
      room.roomType = dto.roomType?.trim().toUpperCase() ?? null;
    if (dto.floor !== undefined) room.floor = dto.floor ?? null;
    if (dto.maxOccupancy !== undefined)
      room.maxOccupancy = dto.maxOccupancy ?? null;
    if (dto.description !== undefined)
      room.description = dto.description ?? null;
    if (dto.status !== undefined) room.status = dto.status;

    const saved = await this.roomRepo.save(room);
    return this.toRoomResponse(saved);
  }

  // ── Rate plans ───────────────────────────────────────────────────────────

  private toRatePlanResponse(p: HotelRatePlan) {
    return {
      id: p.id,
      branchId: p.branchId,
      name: p.name,
      roomType: p.roomType,
      weekdayRate: Number(p.weekdayRate),
      weekendRate: p.weekendRate !== null ? Number(p.weekendRate) : null,
      currency: p.currency,
      taxPercent: p.taxPercent !== null ? Number(p.taxPercent) : null,
      serviceChargePercent:
        p.serviceChargePercent !== null ? Number(p.serviceChargePercent) : null,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  async listRatePlans(query: ListHotelRatePlansQueryDto) {
    const qb = this.ratePlanRepo
      .createQueryBuilder('rp')
      .where('rp.branchId = :branchId', { branchId: query.branchId });

    if (query.roomType)
      qb.andWhere('rp.roomType = :roomType', {
        roomType: query.roomType.trim().toUpperCase(),
      });
    if (query.isActive !== undefined)
      qb.andWhere('rp.isActive = :isActive', { isActive: query.isActive });

    const plans = await qb.orderBy('rp.name', 'ASC').getMany();
    return { items: plans.map((p) => this.toRatePlanResponse(p)) };
  }

  async createRatePlan(dto: CreateHotelRatePlanDto) {
    const plan = this.ratePlanRepo.create({
      branchId: dto.branchId,
      name: dto.name.trim(),
      roomType: dto.roomType?.trim().toUpperCase() ?? null,
      weekdayRate: dto.weekdayRate,
      weekendRate: dto.weekendRate ?? null,
      currency: dto.currency?.trim().toUpperCase() ?? 'ETB',
      taxPercent: dto.taxPercent ?? null,
      serviceChargePercent: dto.serviceChargePercent ?? null,
      isActive: dto.isActive !== false,
    });

    const saved = await this.ratePlanRepo.save(plan);
    return this.toRatePlanResponse(saved);
  }

  // ── Reservations ─────────────────────────────────────────────────────────

  private toReservationResponse(r: HotelReservation) {
    return {
      id: r.id,
      branchId: r.branchId,
      status: r.status,
      roomNumber: r.roomNumber,
      roomType: r.roomType,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      guestEmail: r.guestEmail,
      guestNationality: r.guestNationality,
      guestIdType: r.guestIdType,
      guestIdNumber: r.guestIdNumber,
      numberOfGuests: r.numberOfGuests,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      ratePlanId: r.ratePlanId,
      folioId: r.folioId,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async listReservations(query: ListHotelReservationsQueryDto) {
    const qb = this.reservationRepo
      .createQueryBuilder('res')
      .where('res.branchId = :branchId', { branchId: query.branchId });

    if (query.status)
      qb.andWhere('res.status = :status', { status: query.status });

    if (query.checkInDate)
      qb.andWhere('res.checkInAt = :checkInDate', {
        checkInDate: query.checkInDate,
      });

    const limit = Math.min(query.limit ?? 50, 200);
    const page = Math.max(query.page ?? 1, 1);
    const offset = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy('res.checkInAt', 'ASC')
      .addOrderBy('res.createdAt', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((r) => this.toReservationResponse(r)),
      total,
      page,
      limit,
    };
  }

  async createReservation(
    dto: CreateHotelReservationDto,
    actor?: ActorSummary,
  ) {
    const reservation = this.reservationRepo.create({
      branchId: dto.branchId,
      status: dto.status ?? HotelReservationStatus.CONFIRMED,
      roomNumber: dto.roomNumber?.trim() ?? null,
      roomType: dto.roomType?.trim().toUpperCase() ?? null,
      guestName: dto.guestName.trim(),
      guestPhone: dto.guestPhone?.trim() ?? null,
      guestEmail: dto.guestEmail?.trim().toLowerCase() ?? null,
      guestNationality: dto.guestNationality ?? null,
      guestIdType: dto.guestIdType ?? null,
      guestIdNumber: dto.guestIdNumber ?? null,
      numberOfGuests: dto.numberOfGuests ?? 1,
      checkInAt: dto.checkInAt,
      checkOutAt: dto.checkOutAt,
      ratePlanId: dto.ratePlanId ?? null,
      notes: dto.notes?.trim() ?? null,
      createdByUserId: actor?.id ?? null,
    });

    const saved = await this.reservationRepo.save(reservation);
    return this.toReservationResponse(saved);
  }

  async updateReservation(id: number, dto: UpdateHotelReservationDto) {
    const res = await this.reservationRepo.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!res) throw new NotFoundException(`Reservation ${id} not found.`);

    if (dto.status !== undefined) res.status = dto.status;
    if (dto.roomNumber !== undefined)
      res.roomNumber = dto.roomNumber?.trim() ?? null;
    if (dto.guestName !== undefined) res.guestName = dto.guestName.trim();
    if (dto.guestPhone !== undefined)
      res.guestPhone = dto.guestPhone?.trim() ?? null;
    if (dto.checkInAt !== undefined) res.checkInAt = dto.checkInAt;
    if (dto.checkOutAt !== undefined) res.checkOutAt = dto.checkOutAt;
    if (dto.ratePlanId !== undefined) res.ratePlanId = dto.ratePlanId ?? null;
    if (dto.folioId !== undefined) res.folioId = dto.folioId ?? null;
    if (dto.notes !== undefined) res.notes = dto.notes?.trim() ?? null;

    const saved = await this.reservationRepo.save(res);
    return this.toReservationResponse(saved);
  }

  // ── Night audit ──────────────────────────────────────────────────────────

  /**
   * Post ROOM_NIGHT charges for every OPEN folio in the branch whose
   * checkout date has not yet passed.  Idempotent per (folioId, auditDate).
   */
  async runNightAudit(dto: TriggerNightAuditDto, actor?: ActorSummary) {
    const EAT_OFFSET_MS = 3 * 60 * 60_000;
    const auditDate =
      dto.auditDate?.trim() ||
      new Date(Date.now() + EAT_OFFSET_MS).toISOString().slice(0, 10);

    // Load all active rate plans for this branch (keyed by roomType, '' = default)
    const ratePlans = await this.ratePlanRepo.find({
      where: { branchId: dto.branchId, isActive: true },
    });

    // Build lookup: roomType (upper) → plan; '' → fallback/default plan
    const planByType = new Map<string, HotelRatePlan>();
    let defaultPlan: HotelRatePlan | null = null;

    for (const p of ratePlans) {
      if (p.roomType) {
        planByType.set(p.roomType.toUpperCase(), p);
      } else {
        // Prefer an explicit defaultRatePlanId if provided
        if (!defaultPlan || p.id === dto.defaultRatePlanId) {
          defaultPlan = p;
        }
      }
    }

    // If a specific defaultRatePlanId was given, find it
    if (dto.defaultRatePlanId && !planByType.size && !defaultPlan) {
      defaultPlan = await this.ratePlanRepo.findOne({
        where: { id: dto.defaultRatePlanId },
      });
    }

    // Fetch all OPEN folios for this branch
    const openFolios = await this.folioRepo.find({
      where: { branchId: dto.branchId, status: HotelFolioStatus.OPEN },
    });

    let chargesPosted = 0;
    let totalAmount = 0;
    const currency = defaultPlan?.currency ?? 'ETB';
    const skipped: number[] = [];

    for (const folio of openFolios) {
      // Resolve rate plan for this folio's room type
      let plan: HotelRatePlan | null = null;
      if (folio.roomNumber) {
        const room = await this.roomRepo.findOne({
          where: { branchId: dto.branchId, roomNumber: folio.roomNumber },
        });
        if (room?.roomType) {
          plan = planByType.get(room.roomType.toUpperCase()) ?? null;
        }
      }
      plan = plan ?? defaultPlan;

      if (!plan) {
        skipped.push(folio.id);
        continue;
      }

      const weekdayRate = Number(plan.weekdayRate);
      const weekendRate =
        plan.weekendRate != null ? Number(plan.weekendRate) : weekdayRate;

      if (!weekdayRate || weekdayRate <= 0) {
        skipped.push(folio.id);
        continue;
      }

      // Determine the date range to post charges for.
      // For current guests (checkOutAt >= auditDate or no checkOutAt): just auditDate.
      // For overdue guests (checkOutAt < auditDate): backfill from checkOutAt through
      // auditDate so all missed nightly charges are captured in one run.
      const fromDate =
        folio.checkOutAt && folio.checkOutAt < auditDate
          ? folio.checkOutAt
          : auditDate;

      // Build list of dates [fromDate … auditDate]
      const datesToPost: string[] = [];
      let cur = new Date(fromDate + 'T12:00:00Z');
      const end = new Date(auditDate + 'T12:00:00Z');
      while (cur <= end) {
        datesToPost.push(cur.toISOString().slice(0, 10));
        cur = new Date(cur.getTime() + 24 * 60 * 60_000);
      }

      for (const dateStr of datesToPost) {
        const idempotencyKey = `night-audit:${dateStr}:${folio.id}`;

        // Idempotency check
        const existing = await this.chargeRepo.findOne({
          where: { folioId: folio.id, idempotencyKey },
        });
        if (existing) continue;

        const dateDow = new Date(dateStr + 'T12:00:00Z').getDay();
        const rate = dateDow === 5 || dateDow === 6 ? weekendRate : weekdayRate;

        // Post the charge
        const charge = this.chargeRepo.create({
          folioId: folio.id,
          branchId: dto.branchId,
          chargeGroupCode: 'ROOM_NIGHT',
          chargeName: `Room charge – ${dateStr}`,
          amount: Math.round((rate + Number.EPSILON) * 100) / 100,
          currency: folio.currency || plan.currency || 'ETB',
          quantity: 1,
          idempotencyKey,
        });

        await this.chargeRepo.save(charge);
        await this.folioRepo.increment({ id: folio.id }, 'chargesTotal', rate);

        chargesPosted++;
        totalAmount += rate;
      }
    }

    // Log the audit run
    const log = this.auditLogRepo.create({
      branchId: dto.branchId,
      auditDate,
      foliosProcessed: openFolios.length,
      chargesPosted,
      totalAmount: Math.round((totalAmount + Number.EPSILON) * 100) / 100,
      currency,
      triggeredByUserId: actor?.id ?? null,
    });
    const savedLog = await this.auditLogRepo.save(log);

    return {
      id: savedLog.id,
      auditDate,
      foliosProcessed: openFolios.length,
      chargesPosted,
      skipped: skipped.length,
      totalAmount: savedLog.totalAmount,
      currency,
    };
  }

  async listNightAuditLogs(query: ListNightAuditLogsQueryDto) {
    const limit = Math.min(query.limit ?? 30, 90);
    const logs = await this.auditLogRepo.find({
      where: { branchId: query.branchId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return {
      items: logs.map((l) => ({
        id: l.id,
        auditDate: l.auditDate,
        foliosProcessed: l.foliosProcessed,
        chargesPosted: l.chargesPosted,
        totalAmount: Number(l.totalAmount),
        currency: l.currency,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }
}
