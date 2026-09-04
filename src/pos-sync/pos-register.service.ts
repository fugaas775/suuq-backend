import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { PosRegisterReportService } from './pos-register-report.service';
import { ClosePosRegisterSessionDto } from './dto/close-pos-register-session.dto';
import { CreatePosRegisterSessionDto } from './dto/create-pos-register-session.dto';
import { CreatePosSuspendedCartDto } from './dto/create-pos-suspended-cart.dto';
import { ListPosRegisterSessionsQueryDto } from './dto/list-pos-register-sessions-query.dto';
import { ListPosSuspendedCartsQueryDto } from './dto/list-pos-suspended-carts-query.dto';
import {
  PosRegisterSessionPageResponseDto,
  PosRegisterSessionResponseDto,
} from './dto/pos-register-session-response.dto';
import {
  PosSuspendedCartPageResponseDto,
  PosSuspendedCartResponseDto,
} from './dto/pos-suspended-cart-response.dto';
import { TransitionPosSuspendedCartDto } from './dto/transition-pos-suspended-cart.dto';
import { UpdatePosSuspendedCartDto } from './dto/update-pos-suspended-cart.dto';
import {
  PosRegisterSession,
  PosRegisterSessionStatus,
} from './entities/pos-register-session.entity';
import {
  PosSuspendedCart,
  PosSuspendedCartStatus,
} from './entities/pos-suspended-cart.entity';

@Injectable()
export class PosRegisterService {
  constructor(
    @InjectRepository(PosRegisterSession)
    private readonly registerSessionsRepository: Repository<PosRegisterSession>,
    @InjectRepository(PosSuspendedCart)
    private readonly suspendedCartsRepository: Repository<PosSuspendedCart>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    private readonly reportService: PosRegisterReportService,
  ) {}

  async findSessions(
    query: ListPosRegisterSessionsQueryDto,
  ): Promise<PosRegisterSessionPageResponseDto> {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const qb = this.registerSessionsRepository
      .createQueryBuilder('session')
      .where('session.branchId = :branchId', { branchId: query.branchId })
      .orderBy('session.openedAt', 'DESC')
      .addOrderBy('session.id', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (query.status) {
      qb.andWhere('session.status = :status', { status: query.status });
    }
    if (query.registerId) {
      qb.andWhere('session.registerId = :registerId', {
        registerId: query.registerId,
      });
    }

    if (query.fromAt) {
      const fromAt = new Date(query.fromAt);
      if (!Number.isNaN(fromAt.getTime())) {
        qb.andWhere(
          '(session.closedAt IS NULL OR session.closedAt >= :fromAt)',
          { fromAt },
        );
      }
    }

    if (query.toAt) {
      const toAt = new Date(query.toAt);
      if (!Number.isNaN(toAt.getTime())) {
        qb.andWhere('session.openedAt <= :toAt', { toAt });
      }
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((item) => this.toSessionResponse(item)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async openSession(
    dto: CreatePosRegisterSessionDto,
    actor: { id?: number | null; email?: string | null } = {},
  ): Promise<PosRegisterSessionResponseDto> {
    await this.assertBranch(dto.branchId);

    // For shared-session formats (e.g. HOTEL): find any open session for the branch
    // regardless of registerId, so all front-desk devices share the same session.
    // If no open session exists, fall through to create a new one.
    if (dto.sharedSession) {
      const anyOpen = await this.registerSessionsRepository.findOne({
        where: {
          branchId: dto.branchId,
          status: PosRegisterSessionStatus.OPEN,
        },
        order: { openedAt: 'DESC' },
      });
      if (anyOpen) return this.toSessionResponse(anyOpen);
      // No open session — fall through to create a new one.
    }

    const existingOpen = await this.registerSessionsRepository.findOne({
      where: {
        branchId: dto.branchId,
        registerId: dto.registerId.trim(),
        status: PosRegisterSessionStatus.OPEN,
      },
    });
    if (existingOpen) {
      return this.toSessionResponse(existingOpen);
    }

    // Compute the next per-branch sequential number so every device/browser
    // sees the same human-readable session number instead of a local counter.
    const existingCount = await this.registerSessionsRepository.count({
      where: { branchId: dto.branchId },
    });
    const branchSessionNumber = existingCount + 1;

    const session = await this.registerSessionsRepository.save(
      this.registerSessionsRepository.create({
        branchId: dto.branchId,
        registerId: dto.registerId.trim(),
        status: PosRegisterSessionStatus.OPEN,
        openedAt: new Date(),
        openedByUserId: actor.id ?? null,
        openedByName: actor.email ?? null,
        openingFloat: dto.openingFloat ?? null,
        closingFloat: null,
        note: dto.note?.trim() || null,
        metadata: dto.metadata ?? null,
        branchSessionNumber,
      }),
    );

    return this.toSessionResponse(session);
  }

  async closeSession(
    id: number,
    dto: ClosePosRegisterSessionDto,
    actor: { id?: number | null; email?: string | null } = {},
  ): Promise<PosRegisterSessionResponseDto> {
    const session = await this.findSession(id);
    if (session.branchId !== dto.branchId) {
      throw new BadRequestException(
        `Register session ${id} does not belong to branch ${dto.branchId}`,
      );
    }

    if (session.status === PosRegisterSessionStatus.CLOSED) {
      return this.toSessionResponse(session);
    }

    session.status = PosRegisterSessionStatus.CLOSED;
    session.closedAt = new Date();
    session.closedByUserId = actor.id ?? null;
    session.closedByName = actor.email ?? null;
    if (dto.closingFloat !== undefined) {
      session.closingFloat = dto.closingFloat;
    }
    session.note = dto.note?.trim() || session.note || null;
    session.metadata = dto.metadata
      ? { ...(session.metadata || {}), ...dto.metadata }
      : session.metadata || null;

    const saved = await this.registerSessionsRepository.save(session);

    // Fire-and-forget: email an end-of-shift report (with PDF) to the branch
    // owner. When the closing client sends its "Today"-tab session report we
    // render that (exact match, incl. KDS data the server can't see); otherwise
    // we fall back to a server-side aggregation. dispatchCloseReport never
    // throws, so a report/email failure can't break the close, and it is not
    // awaited so the close response stays snappy.
    void this.reportService.dispatchCloseReport(saved, {
      report: dto.report,
      serviceFormat: dto.serviceFormat,
    });

    return this.toSessionResponse(saved);
  }

  async findSuspendedCarts(
    query: ListPosSuspendedCartsQueryDto,
  ): Promise<PosSuspendedCartPageResponseDto> {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const qb = this.suspendedCartsRepository
      .createQueryBuilder('cart')
      .where('cart.branchId = :branchId', { branchId: query.branchId })
      .orderBy('cart.createdAt', 'DESC')
      .addOrderBy('cart.id', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (query.status) {
      qb.andWhere('cart.status = :status', { status: query.status });
    }
    if (query.registerSessionId != null) {
      qb.andWhere('cart.registerSessionId = :registerSessionId', {
        registerSessionId: query.registerSessionId,
      });
    }
    if (query.registerId) {
      if (query.includeConsumerOrders) {
        // Include register-scoped carts OR null-registerId consumer orders (SUUQS)
        qb.andWhere(
          "(cart.registerId = :registerId OR (cart.registerId IS NULL AND cart.metadata->>'consumerSource' = 'SUUQS'))",
          { registerId: query.registerId },
        );
      } else {
        qb.andWhere('cart.registerId = :registerId', {
          registerId: query.registerId,
        });
      }
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((item) => this.toSuspendedCartResponse(item)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async suspendCart(
    dto: CreatePosSuspendedCartDto,
    actor: { id?: number | null; email?: string | null } = {},
  ): Promise<PosSuspendedCartResponseDto> {
    await this.assertBranch(dto.branchId);
    if (dto.registerSessionId != null) {
      const session = await this.findSession(dto.registerSessionId);
      if (session.branchId !== dto.branchId) {
        throw new BadRequestException(
          `Register session ${dto.registerSessionId} does not belong to branch ${dto.branchId}`,
        );
      }
      if (session.status !== PosRegisterSessionStatus.OPEN) {
        throw new BadRequestException(
          `Register session ${dto.registerSessionId} is not open`,
        );
      }
    }

    // Idempotency for offline-parked baskets: a lane that holds a basket while
    // offline replays it on reconnect. If the original POST reached us but its
    // response was dropped mid-reconnect, the retry carries the same clientRef —
    // return the already-created cart instead of inserting a duplicate. The
    // unique (branchId, clientRef) index is the backstop for a concurrent race.
    const clientRef = dto.clientRef?.trim() || null;
    if (clientRef) {
      const existing = await this.suspendedCartsRepository.findOne({
        where: { branchId: dto.branchId, clientRef },
      });
      if (existing) {
        return this.toSuspendedCartResponse(existing);
      }
    }

    const buildCart = () =>
      this.suspendedCartsRepository.create({
        branchId: dto.branchId,
        registerSessionId: dto.registerSessionId ?? null,
        registerId: dto.registerId?.trim() || null,
        clientRef,
        label: dto.label.trim(),
        status: PosSuspendedCartStatus.SUSPENDED,
        currency: dto.currency.trim().toUpperCase(),
        promoCode: dto.promoCode?.trim() || null,
        itemCount: dto.itemCount,
        total: dto.total,
        note: dto.note?.trim() || null,
        cartSnapshot: dto.cartSnapshot,
        metadata: dto.metadata ?? null,
        suspendedByUserId: actor.id ?? null,
        suspendedByName: actor.email ?? null,
      });

    // Single-live-row invariant for folio re-saves. Editing a folio (adding a
    // charge, a discount, guest details) creates a FRESH suspended-cart row and
    // the client then discards the old one. When that discard is lost — offline,
    // a multi-device race, a failed mutation, or a rapid re-save loop — the old
    // row survives. The room board SUMS every live row for a room, so duplicates
    // MULTIPLY its charge (Blue Hotel Room 10 accumulated 8 live rows of 40,000
    // and displayed ~320,000 until staff voided the extras by hand). Make the
    // supersede atomic on the server so duplicates can never be written,
    // whatever the client does: under an advisory lock keyed on the folio,
    // discard any prior live row for the SAME folio+unit before inserting.
    //
    // Keyed on the room/table/seat unit too, NOT folio id alone: PROPERTY_RENTAL
    // bookings can legitimately share a backendFolioId across DISTINCT units, and
    // those must never be merged. Same-folio + same-unit is the exact "true
    // duplicate" condition. Skipped when there is no backendFolioId (RETAIL/QSR
    // baskets and not-yet-opened folios) — each of those is a distinct row.
    const snapshot = (dto.cartSnapshot ?? {}) as Record<string, unknown>;
    const backendFolioId =
      snapshot.backendFolioId != null && String(snapshot.backendFolioId).trim()
        ? String(snapshot.backendFolioId).trim()
        : null;

    if (!backendFolioId) {
      return this.toSuspendedCartResponse(
        await this.suspendedCartsRepository.save(buildCart()),
      );
    }

    const folioUnitKey = String(
      snapshot.hotelRoomNumber ??
        snapshot.cafeteriaTableNumber ??
        snapshot.barberSeatNumber ??
        dto.label ??
        '',
    )
      .trim()
      .toLowerCase();

    const saved = await this.suspendedCartsRepository.manager.transaction(
      async (em) => {
        // Serialize concurrent saves of the same folio so two devices can't both
        // insert before seeing each other's row. Released at transaction end.
        await em.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
          `pos-folio:${dto.branchId}:${backendFolioId}`,
        ]);
        await em.query(
          `UPDATE pos_suspended_carts
              SET status = $1, "discardedAt" = now(), "discardedByName" = $2
            WHERE "branchId" = $3
              AND status = $4
              AND "cartSnapshot" ->> 'backendFolioId' = $5
              AND lower(btrim(coalesce(
                    "cartSnapshot" ->> 'hotelRoomNumber',
                    "cartSnapshot" ->> 'cafeteriaTableNumber',
                    "cartSnapshot" ->> 'barberSeatNumber',
                    label, ''))) = $6`,
          [
            PosSuspendedCartStatus.DISCARDED,
            'superseded by folio re-save',
            dto.branchId,
            PosSuspendedCartStatus.SUSPENDED,
            backendFolioId,
            folioUnitKey,
          ],
        );
        return em.getRepository(PosSuspendedCart).save(buildCart());
      },
    );

    return this.toSuspendedCartResponse(saved);
  }

  async resumeSuspendedCart(
    id: number,
    dto: TransitionPosSuspendedCartDto,
    actor: { id?: number | null; email?: string | null } = {},
  ): Promise<PosSuspendedCartResponseDto> {
    const cart = await this.findSuspendedCart(id);
    if (cart.branchId !== dto.branchId) {
      throw new BadRequestException(
        `Suspended cart ${id} does not belong to branch ${dto.branchId}`,
      );
    }
    if (cart.status !== PosSuspendedCartStatus.SUSPENDED) {
      return this.toSuspendedCartResponse(cart);
    }

    cart.status = PosSuspendedCartStatus.RESUMED;
    cart.resumedAt = new Date();
    cart.resumedByUserId = actor.id ?? null;
    cart.resumedByName = actor.email ?? null;
    return this.toSuspendedCartResponse(
      await this.suspendedCartsRepository.save(cart),
    );
  }

  async discardSuspendedCart(
    id: number,
    dto: TransitionPosSuspendedCartDto,
    actor: { id?: number | null; email?: string | null } = {},
  ): Promise<PosSuspendedCartResponseDto> {
    const cart = await this.findSuspendedCart(id);
    if (cart.branchId !== dto.branchId) {
      throw new BadRequestException(
        `Suspended cart ${id} does not belong to branch ${dto.branchId}`,
      );
    }
    if (cart.status !== PosSuspendedCartStatus.SUSPENDED) {
      return this.toSuspendedCartResponse(cart);
    }

    cart.status = PosSuspendedCartStatus.DISCARDED;
    cart.discardedAt = new Date();
    cart.discardedByUserId = actor.id ?? null;
    cart.discardedByName = actor.email ?? null;

    // A guest is watching this row, and discarding is how BOTH outcomes look:
    // a settled order and a refused one are the same DISCARDED row. Stamping
    // which one it was in the SAME save is the point — the register used to
    // PATCH a completion stamp just before the discard, fire-and-forget, and
    // when that lost the race a guest who had just paid and collected was told
    // their order was cancelled.
    //
    // Only an EXPLICIT outcome stamps anything. A consumer row is discarded from
    // roughly thirty places — folio voids, check-outs, duplicate sweeps, stale
    // cleanups — and none of those is the shop refusing a guest. Inferring
    // "declined" from the absence of a completion would relabel every one of
    // them, so silence keeps exactly the behaviour it had.
    if (cart.metadata?.consumerSource === 'SUUQS' && dto.outcome) {
      const now = new Date().toISOString();
      const stamped = { ...(cart.metadata ?? {}) };
      if (dto.outcome === 'COMPLETED') {
        stamped.consumerCompletedAt = stamped.consumerCompletedAt ?? now;
      } else if (!stamped.consumerCompletedAt) {
        stamped.consumerDeclinedAt = stamped.consumerDeclinedAt ?? now;
        if (dto.declineReason)
          stamped.consumerDeclineReason = dto.declineReason;
        stamped.consumerDeclinedByName = actor.email ?? null;
      }
      cart.metadata = stamped;
    }

    const saved = await this.suspendedCartsRepository.save(cart);

    // A school withdrawal destroys the folio the roll remembers a pupil by, so
    // the owner gets an emailed record of who left and what money stood against
    // them. Fire-and-forget AFTER the save: the child is off the roll either
    // way, and a mail failure must not report the withdrawal as failed.
    if (dto.withdrawal) {
      void this.reportService.dispatchStudentWithdrawalEmail(saved, actor);
    }

    return this.toSuspendedCartResponse(saved);
  }

  async updateSuspendedCart(
    id: number,
    dto: UpdatePosSuspendedCartDto,
  ): Promise<PosSuspendedCartResponseDto> {
    const cart = await this.findSuspendedCart(id);
    if (cart.branchId !== dto.branchId) {
      throw new BadRequestException(
        `Suspended cart ${id} does not belong to branch ${dto.branchId}`,
      );
    }
    if (cart.status !== PosSuspendedCartStatus.SUSPENDED) {
      throw new BadRequestException(
        `Suspended cart ${id} is ${cart.status} and cannot be updated`,
      );
    }

    if (dto.metadata && typeof dto.metadata === 'object') {
      cart.metadata = {
        ...(cart.metadata ?? {}),
        ...dto.metadata,
      };
    }

    // Replaced wholesale, unlike metadata above: the snapshot is a self-contained
    // document (guest context, line items, payment state), so a shallow merge
    // would leave stale nested keys behind whenever the caller sends a shorter
    // one. Callers send the whole snapshot they want persisted.
    //
    // Without this the endpoint accepted a cartSnapshot and silently discarded
    // it — 200 OK, nothing written — so a board wanting to edit a parked folio
    // had to create a replacement row and discard the original, churning the id
    // (and with it every folioId reference) on each edit.
    if (dto.cartSnapshot && typeof dto.cartSnapshot === 'object') {
      cart.cartSnapshot = dto.cartSnapshot;
    }
    if (typeof dto.label === 'string' && dto.label.trim()) {
      cart.label = dto.label.trim();
    }
    if (typeof dto.itemCount === 'number' && Number.isFinite(dto.itemCount)) {
      cart.itemCount = dto.itemCount;
    }
    if (typeof dto.total === 'number' && Number.isFinite(dto.total)) {
      cart.total = dto.total;
    }

    return this.toSuspendedCartResponse(
      await this.suspendedCartsRepository.save(cart),
    );
  }

  async ackKitchenCancellations(
    id: number,
    dto: TransitionPosSuspendedCartDto,
  ): Promise<PosSuspendedCartResponseDto> {
    const cart = await this.findSuspendedCart(id);
    if (cart.branchId !== dto.branchId) {
      throw new BadRequestException(
        `Suspended cart ${id} does not belong to branch ${dto.branchId}`,
      );
    }
    if (cart.status !== PosSuspendedCartStatus.SUSPENDED) {
      return this.toSuspendedCartResponse(cart);
    }

    const snap = cart.cartSnapshot;
    const cartLines: any[] = Array.isArray(snap?.cartLines)
      ? snap.cartLines
      : [];
    const updated = cartLines.map((l: any) =>
      l?.metadata?.kitchenState === 'CANCELLED'
        ? { ...l, metadata: { ...l.metadata, kitchenState: 'CANCELLED_ACK' } }
        : l,
    );
    cart.cartSnapshot = { ...(snap ?? {}), cartLines: updated };

    return this.toSuspendedCartResponse(
      await this.suspendedCartsRepository.save(cart),
    );
  }

  private async assertBranch(branchId: number): Promise<void> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${branchId} not found`);
    }
  }

  private async findSession(id: number): Promise<PosRegisterSession> {
    const session = await this.registerSessionsRepository.findOne({
      where: { id },
    });
    if (!session) {
      throw new NotFoundException(`Register session ${id} not found`);
    }
    return session;
  }

  private async findSuspendedCart(id: number): Promise<PosSuspendedCart> {
    const cart = await this.suspendedCartsRepository.findOne({ where: { id } });
    if (!cart) {
      throw new NotFoundException(`Suspended cart ${id} not found`);
    }
    return cart;
  }

  private toSessionResponse(
    item: PosRegisterSession,
  ): PosRegisterSessionResponseDto {
    return {
      id: item.id,
      branchId: item.branchId,
      registerId: item.registerId,
      status: item.status,
      openedAt: item.openedAt,
      closedAt: item.closedAt ?? null,
      openedByUserId: item.openedByUserId ?? null,
      openedByName: item.openedByName ?? null,
      closedByUserId: item.closedByUserId ?? null,
      closedByName: item.closedByName ?? null,
      openingFloat: item.openingFloat ?? null,
      closingFloat: item.closingFloat ?? null,
      note: item.note ?? null,
      metadata: item.metadata ?? null,
      branchSessionNumber: item.branchSessionNumber ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private toSuspendedCartResponse(
    item: PosSuspendedCart,
  ): PosSuspendedCartResponseDto {
    return {
      id: item.id,
      branchId: item.branchId,
      registerSessionId: item.registerSessionId ?? null,
      registerId: item.registerId ?? null,
      label: item.label,
      status: item.status,
      currency: item.currency,
      promoCode: item.promoCode ?? null,
      itemCount: item.itemCount,
      total: item.total,
      note: item.note ?? null,
      cartSnapshot: item.cartSnapshot,
      metadata: item.metadata ?? null,
      suspendedByUserId: item.suspendedByUserId ?? null,
      suspendedByName: item.suspendedByName ?? null,
      resumedAt: item.resumedAt ?? null,
      resumedByUserId: item.resumedByUserId ?? null,
      resumedByName: item.resumedByName ?? null,
      discardedAt: item.discardedAt ?? null,
      discardedByUserId: item.discardedByUserId ?? null,
      discardedByName: item.discardedByName ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
