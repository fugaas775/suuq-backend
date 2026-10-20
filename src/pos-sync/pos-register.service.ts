import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { Branch } from '../branches/entities/branch.entity';
import { tenantOwnerOf } from '../school/school-branch-owner.util';
import { PosRegisterReportService } from './pos-register-report.service';
import {
  SCHOOL_WITHDRAWAL_REFUSED_MESSAGE,
  canWithdrawStudent,
  isSchoolPupilFolio,
} from './school-withdrawal.policy';
import {
  PUPIL_CREATE_REFUSED_MESSAGE,
  PUPIL_RECORD_REFUSED_CODE,
  canCreatePupilRecord,
  deltaBeyondScope,
  keepStoredPupilRecord,
  pupilEditScope,
  pupilRecordDelta,
  pupilRecordRefusal,
} from './school-pupil-record.policy';
import {
  isEmptySchoolBasket,
  schoolAdmissionNoOf,
  schoolPupilShapeProblem,
} from './school-roll.policy';
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
    @InjectRepository(BranchStaffAssignment)
    private readonly staffAssignmentsRepository: Repository<BranchStaffAssignment>,
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
    actor: { id?: number | null; email?: string | null; roles?: string[] } = {},
    // Kept for callers that still pass them; no opening-hours rule applies.
    _options: { now?: Date; ignoreOpeningHours?: boolean } = {},
  ): Promise<PosRegisterSessionResponseDto> {
    const branch = await this.assertBranch(dto.branchId);

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

    // No opening-hours refusal (owner 2026-10-18: "Allow cashier or managers
    // to open session with or without the schedule"). The schedule opens and
    // closes the day's register on its own (PosRegisterScheduleService); a
    // person may open one at any hour.

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

  /** One row, any status, only when it sits on `branchId` — see the GET route. */
  async findSuspendedCartOnBranch(
    id: number,
    branchId: number,
  ): Promise<PosSuspendedCartResponseDto> {
    const cart = await this.suspendedCartsRepository.findOne({
      where: { id, branchId },
    });
    if (!cart) {
      throw new NotFoundException(
        `Suspended cart ${id} not found on branch ${branchId}`,
      );
    }
    return this.toSuspendedCartResponse(cart);
  }

  async suspendCart(
    dto: CreatePosSuspendedCartDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[] | null;
    } = {},
  ): Promise<PosSuspendedCartResponseDto> {
    const actorName = await this.resolveActorName(actor, dto.branchId);
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

    // A new pupil on the roll is an enrolment, and enrolling is the office's
    // (owner 2026-10-18: "do not allow cashiers to edit the whole student
    // list, except login only"). After the replay check above, so a till
    // re-sending a park that already landed still gets its row back. Every
    // other basket — and every format but SCHOOL — costs nothing here.
    if (
      isSchoolPupilFolio({
        cartSnapshot: (dto.cartSnapshot ?? {}) as Record<string, unknown>,
      }) &&
      !(await this.mayCreatePupilRecord(dto.branchId, actor))
    ) {
      throw new ForbiddenException({
        code: PUPIL_RECORD_REFUSED_CODE,
        message: PUPIL_CREATE_REFUSED_MESSAGE,
      });
    }

    const buildCart = (
      overrides: {
        cartSnapshot?: Record<string, unknown>;
        metadata?: Record<string, unknown> | null;
      } = {},
    ) =>
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
        cartSnapshot: overrides.cartSnapshot ?? dto.cartSnapshot,
        metadata:
          overrides.metadata !== undefined
            ? overrides.metadata
            : (dto.metadata ?? null),
        suspendedByUserId: actor.id ?? null,
        suspendedByName: actorName,
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
    await this.assertSchoolRollAccepts(dto.branchId, snapshot, null);
    const backendFolioId =
      snapshot.backendFolioId != null && String(snapshot.backendFolioId).trim()
        ? String(snapshot.backendFolioId).trim()
        : null;

    const folioUnitKey = String(
      snapshot.hotelRoomNumber ??
        snapshot.cafeteriaTableNumber ??
        snapshot.barberSeatNumber ??
        dto.label ??
        '',
    )
      .trim()
      .toLowerCase();

    // The same invariant for a HOTEL stay that has NO backend folio id.
    //
    // A stay checked in straight through "Record deposit" is written by the
    // settle path, which opens no backend folio, so every row of that stay
    // carries backendFolioId null — and the folio-keyed supersede above it
    // never applies. Muntaha Room 204 (2026-09-11) accumulated three live copies
    // of one guest's folio that way and the board summed them to 46,500 owed
    // by a guest who owed 13,500. Such a stay is identified by the room, the
    // check-in date and the guest: a room holds one guest at a time, and a
    // re-save carries all three unchanged. The guest name is part of the key
    // on purpose — a stale device checking a DIFFERENT guest into a room must
    // never silently discard the folio (and the payments) of the guest who is
    // actually in it. PROPERTY_RENTAL and every other format stamp their own
    // serviceFormat and are untouched.
    const hotelStayKey =
      !backendFolioId &&
      String(snapshot.serviceFormat ?? '')
        .trim()
        .toUpperCase() === 'HOTEL' &&
      String(snapshot.hotelRoomNumber ?? '').trim() &&
      String(snapshot.hotelCheckInAt ?? '').trim()
        ? {
            unit: String(snapshot.hotelRoomNumber).trim().toLowerCase(),
            checkInAt: String(snapshot.hotelCheckInAt).trim(),
            guest: String(snapshot.hotelGuestName ?? '')
              .trim()
              .toLowerCase(),
          }
        : null;

    if (!backendFolioId && !hotelStayKey) {
      return this.toSuspendedCartResponse(
        await this.suspendedCartsRepository.save(buildCart()),
      );
    }

    const saved = await this.suspendedCartsRepository.manager.transaction(
      async (em) => {
        // Serialize concurrent saves of the same folio so two devices can't both
        // insert before seeing each other's row. Released at transaction end.
        await em.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
          backendFolioId
            ? `pos-folio:${dto.branchId}:${backendFolioId}`
            : `pos-room:${dto.branchId}:${hotelStayKey.unit}`,
        ]);
        const priorRows: Array<{
          id: number;
          total: string | number | null;
          metadata: Record<string, unknown> | null;
          cartSnapshot: Record<string, unknown> | null;
        }> = backendFolioId
          ? await em.query(
              `SELECT id, total, metadata, "cartSnapshot"
                 FROM pos_suspended_carts
                WHERE "branchId" = $1
                  AND status = $2
                  AND "cartSnapshot" ->> 'backendFolioId' = $3
                  AND lower(btrim(coalesce(
                        "cartSnapshot" ->> 'hotelRoomNumber',
                        "cartSnapshot" ->> 'cafeteriaTableNumber',
                        "cartSnapshot" ->> 'barberSeatNumber',
                        label, ''))) = $4
                  FOR UPDATE`,
              [
                dto.branchId,
                PosSuspendedCartStatus.SUSPENDED,
                backendFolioId,
                folioUnitKey,
              ],
            )
          : await em.query(
              `SELECT id, total, metadata, "cartSnapshot"
                 FROM pos_suspended_carts
                WHERE "branchId" = $1
                  AND status = $2
                  AND upper(btrim(coalesce("cartSnapshot" ->> 'serviceFormat', ''))) = 'HOTEL'
                  AND coalesce("cartSnapshot" ->> 'backendFolioId', '') = ''
                  AND lower(btrim(coalesce("cartSnapshot" ->> 'hotelRoomNumber', ''))) = $3
                  AND btrim(coalesce("cartSnapshot" ->> 'hotelCheckInAt', '')) = $4
                  AND lower(btrim(coalesce("cartSnapshot" ->> 'hotelGuestName', ''))) = $5
                  FOR UPDATE`,
              [
                dto.branchId,
                PosSuspendedCartStatus.SUSPENDED,
                hotelStayKey.unit,
                hotelStayKey.checkInAt,
                hotelStayKey.guest,
              ],
            );

        // Money already taken never leaves with a superseded row. The row
        // being written is a RE-SAVE, and a re-save from a device that never
        // saw the row holding the deposit carries no partialPaidAmount at all
        // — so discarding the old row would erase the deposit from every
        // surface at once. Collected money is monotonic (a refund is a return
        // receipt, never a lowered partialPaidAmount), so the largest figure
        // across the rows being retired is carried onto the new row when its
        // own is smaller. A row that declares itself fully paid is left alone:
        // its total already says what was collected.
        const collectedOn = (row: {
          total: string | number | null;
          metadata: Record<string, unknown> | null;
          cartSnapshot: Record<string, unknown> | null;
        }) => {
          const snap = row.cartSnapshot ?? {};
          if (snap.paid === true) return Number(row.total) || 0;
          return (
            Number(
              row.metadata?.partialPaidAmount ?? snap.partialPaidAmount ?? 0,
            ) || 0
          );
        };
        const carried = priorRows.reduce(
          (max, row) => Math.max(max, collectedOn(row)),
          0,
        );
        const own = collectedOn({
          total: dto.total,
          metadata: dto.metadata ?? null,
          cartSnapshot: snapshot,
        });
        const overrides =
          snapshot.paid !== true && carried > own
            ? {
                metadata: {
                  ...(dto.metadata ?? {}),
                  partialPaidAmount: carried,
                },
                cartSnapshot: {
                  ...snapshot,
                  paid: false,
                  partialPaidAmount: carried,
                },
              }
            : {};

        if (priorRows.length > 0) {
          await em.query(
            `UPDATE pos_suspended_carts
                SET status = $1, "discardedAt" = now(), "discardedByName" = $2
              WHERE id = ANY($3::int[])`,
            [
              PosSuspendedCartStatus.DISCARDED,
              'superseded by folio re-save',
              priorRows.map((row) => Number(row.id)),
            ],
          );
        }
        return em.getRepository(PosSuspendedCart).save(buildCart(overrides));
      },
    );

    return this.toSuspendedCartResponse(saved);
  }

  /**
   * A resume or a discard of a basket that is no longer on hold is refused.
   *
   * It used to answer 200 with the row as it stood, so two tills that both
   * listed "Faadumo" could both resume her: the second till loaded the lines
   * from its own stale copy and the basket was sold twice. 409 names the
   * state and who has it, so the till can say "another till took it".
   */
  private refuseUnlessSuspended(cart: PosSuspendedCart): void {
    if (cart.status === PosSuspendedCartStatus.SUSPENDED) {
      return;
    }
    const discarded = cart.status === PosSuspendedCartStatus.DISCARDED;
    throw new ConflictException({
      code: 'SUSPENDED_CART_NOT_SUSPENDED',
      message: discarded
        ? 'This sale is no longer on hold — it was discarded.'
        : 'This sale is no longer on hold — another till resumed it.',
      details: {
        status: cart.status,
        resumedByUserId: cart.resumedByUserId ?? null,
        resumedByName: cart.resumedByName ?? null,
        resumedAt: cart.resumedAt ?? null,
        discardedByUserId: cart.discardedByUserId ?? null,
        discardedAt: cart.discardedAt ?? null,
      },
    });
  }

  /**
   * The name a held sale is signed with. The request carries the actor's
   * e-mail, which the till's card ellipsised to "fugaas775@gm…"; the staff
   * roster knows the person's display name. Owners and anyone without a
   * roster row fall back to the part of the e-mail before the @. Never
   * throws: a name is worth one lookup, not a failed hold.
   */
  private async resolveActorName(
    actor: { id?: number | null; email?: string | null },
    branchId: number,
  ): Promise<string | null> {
    const email = String(actor?.email ?? '').trim();
    const emailLocal = email.includes('@')
      ? email.slice(0, email.indexOf('@'))
      : email;
    if (actor?.id == null) {
      return emailLocal || null;
    }
    try {
      const assignment = await this.staffAssignmentsRepository.findOne({
        where: { branchId, userId: actor.id },
        relations: ['user'],
      });
      const user = assignment?.user as
        | { displayName?: string | null; storeName?: string | null }
        | undefined;
      const name = String(user?.displayName || user?.storeName || '').trim();
      if (name) {
        return name;
      }
    } catch {
      /* a name is best effort */
    }
    return emailLocal || null;
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
    this.refuseUnlessSuspended(cart);

    cart.status = PosSuspendedCartStatus.RESUMED;
    cart.resumedAt = new Date();
    cart.resumedByUserId = actor.id ?? null;
    cart.resumedByName = await this.resolveActorName(actor, cart.branchId);
    return this.toSuspendedCartResponse(
      await this.suspendedCartsRepository.save(cart),
    );
  }

  async discardSuspendedCart(
    id: number,
    dto: TransitionPosSuspendedCartDto,
    actor: {
      id?: number | null;
      email?: string | null;
      /**
       * The caller reached the route on SUSPEND_SALE alone — no discard, settle
       * or void permission, and not the branch's owner or a manager. Set by the
       * controller from what the guard stamped; absent means unrestricted.
       */
      ownCartsOnly?: boolean;
    } = {},
  ): Promise<PosSuspendedCartResponseDto> {
    const cart = await this.findSuspendedCart(id);
    if (cart.branchId !== dto.branchId) {
      throw new BadRequestException(
        `Suspended cart ${id} does not belong to branch ${dto.branchId}`,
      );
    }
    this.refuseUnlessSuspended(cart);

    // Parking a sale is not the right to void somebody else's. The QSR waiter
    // preset is OPEN_REGISTER + SUSPEND_SALE + RESUME_SUSPENDED_SALE, and the
    // route accepts SUSPEND_SALE so a waiter can clear the source rows of their
    // own merge and turn down a customer's order nobody has accepted — which
    // let any waiter wipe any open order in the branch with one direct call.
    // The till only offers "Void entire order" to a manager.
    if (
      actor.ownCartsOnly &&
      !this.isPendingConsumerOrder(cart) &&
      !this.isCallersOwnCart(
        cart,
        actor,
        await this.resolveActorName(actor, cart.branchId),
      )
    ) {
      throw new ForbiddenException(
        `Order #${cart.id} is not yours to remove. Parking sales lets you clear only your own orders — ask a manager, or someone who can void or settle orders, to remove it.`,
      );
    }

    // Every discard of a pupil's folio is a withdrawal, whether it arrives
    // flagged as one from Seller HQ or as a write-off from the till, so the
    // gate sits on the discard itself rather than on the flag.
    if (isSchoolPupilFolio(cart)) {
      await this.assertCanWithdrawStudent(cart, actor);
    }

    cart.status = PosSuspendedCartStatus.DISCARDED;
    cart.discardedAt = new Date();
    cart.discardedByUserId = actor.id ?? null;
    cart.discardedByName = await this.resolveActorName(actor, cart.branchId);

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

  /**
   * Whether a held cart belongs to the caller, read the way the waiter's own
   * Orders board reads it: parked by them, sent to them (`waiterUserId`, which
   * a transfer re-points), or a table they own (`tableOwnerUserId`). The ids in
   * a snapshot are written by the till as strings or numbers, so both compare.
   *
   * The name fallback mirrors the board's for a QSR order that carries no
   * waiter id at all (sent from the counter by name only) — the board lists it
   * to the waiter it names, so their merge has to be able to clear it. Never
   * used once an id is present: an id that names someone else is not theirs.
   */
  private isCallersOwnCart(
    cart: PosSuspendedCart,
    actor: { id?: number | null; email?: string | null },
    actorName: string | null,
  ): boolean {
    const me = Number(actor.id);
    if (!Number.isFinite(me) || me <= 0) {
      return false;
    }
    const sameId = (value: unknown) =>
      value != null && value !== '' && Number(value) === me;
    const snapshot = (cart.cartSnapshot ?? {}) as Record<string, unknown>;
    if (
      sameId(cart.suspendedByUserId) ||
      sameId(snapshot.waiterUserId) ||
      sameId(snapshot.tableOwnerUserId)
    ) {
      return true;
    }
    const hasWaiterId =
      snapshot.waiterUserId != null && snapshot.waiterUserId !== '';
    if (
      hasWaiterId ||
      String(snapshot.serviceFormat ?? '').toUpperCase() !== 'QSR'
    ) {
      return false;
    }
    const tag = String(snapshot.hotelGuestName ?? '')
      .trim()
      .toLowerCase();
    if (!tag) {
      return false;
    }
    const email = String(actor.email ?? '')
      .trim()
      .toLowerCase();
    const mine = [
      String(actorName ?? '')
        .trim()
        .toLowerCase(),
      email,
      email.includes('@') ? email.slice(0, email.indexOf('@')) : '',
    ].filter(Boolean);
    return mine.includes(tag);
  }

  /**
   * What a caller who can only park sales (the QSR waiter, the vehicle desk)
   * or only mark food ready (the cook) may write with PATCH. The route has to
   * accept them — a waiter amends, prints, asks for a settle or a void on
   * their own orders, and takes over orders handed to them — but it replaces
   * the snapshot wholesale and merges metadata key by key, so without this any
   * of them could rewrite any order in the branch: its lines, its total, its
   * paid flag, or its waiter (and then discard it as their own).
   *
   * Judged against the row as stored (under the lock), never the caller's copy.
   */
  private assertLimitedWriterMayPatch(
    cart: PosSuspendedCart,
    dto: UpdatePosSuspendedCartDto,
    actor: { id?: number | null; email?: string | null },
    limits: { mayMarkKitchen: boolean },
    actorName: string | null,
  ): void {
    const stored = (cart.cartSnapshot ?? {}) as Record<string, unknown>;
    const storedMeta = (cart.metadata ?? {}) as Record<string, unknown>;
    const incoming =
      dto.cartSnapshot && typeof dto.cartSnapshot === 'object'
        ? (dto.cartSnapshot as Record<string, unknown>)
        : null;
    const meta =
      dto.metadata && typeof dto.metadata === 'object'
        ? (dto.metadata as Record<string, unknown>)
        : null;
    const money = (value: unknown) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    // Taking money is the counter's, on anyone's order including your own. No
    // waiter-lane write sets either: a re-park carries the stored payment
    // state forward unchanged, and a settle request records the ASK, not a
    // payment.
    if (
      (incoming && incoming.paid === true && stored.paid !== true) ||
      (incoming &&
        money(incoming.partialPaidAmount) > money(stored.partialPaidAmount)) ||
      (meta &&
        money(meta.partialPaidAmount) > money(storedMeta.partialPaidAmount))
    ) {
      throw new ForbiddenException(
        `Order #${cart.id}: only someone who can settle orders can record a payment on it.`,
      );
    }

    if (this.isCallersOwnCart(cart, actor, actorName)) {
      return;
    }

    const me = Number(actor.id);
    const sameId = (value: unknown) =>
      Number.isFinite(me) &&
      me > 0 &&
      value != null &&
      value !== '' &&
      Number(value) === me;
    const unchangedNumber = (sent: unknown, current: unknown) =>
      sent === undefined || sent === null || Number(sent) === Number(current);
    const sameLabel =
      dto.label === undefined ||
      dto.label === null ||
      String(dto.label).trim() === '' ||
      String(dto.label).trim() === String(cart.label ?? '').trim();
    const untouchedTotals =
      unchangedNumber(dto.total, cart.total) &&
      unchangedNumber(dto.itemCount, cart.itemCount);

    // (d) The cook's "this station's food is up": metadata under
    // `qsrKitchen:<STATION>` and nothing else on the row.
    if (
      limits.mayMarkKitchen &&
      meta &&
      Object.keys(meta).length > 0 &&
      Object.keys(meta).every((key) => key.startsWith('qsrKitchen:')) &&
      !incoming &&
      dto.label === undefined &&
      dto.total === undefined &&
      dto.itemCount === undefined
    ) {
      return;
    }

    const offer =
      stored.orderTransfer && typeof stored.orderTransfer === 'object'
        ? (stored.orderTransfer as Record<string, unknown>)
        : null;
    const offeredToMe = Boolean(offer && sameId(offer.toUserId));

    if (offeredToMe && offer && incoming && !meta && untouchedTotals) {
      // (a) Accepting a hand-over offered to me: the offer comes off, the order
      // becomes mine, and the food on it is exactly what was offered.
      if (
        !offer.declinedAt &&
        stored.paid !== true &&
        incoming.orderTransfer == null &&
        sameId(incoming.waiterUserId) &&
        canonicalJson(incoming.cartLines ?? []) ===
          canonicalJson(stored.cartLines ?? [])
      ) {
        return;
      }

      // (c) Declining it (or taking the offer off): nothing on the order moves
      // but the offer itself, which keeps who it was from and to.
      const nextOffer =
        incoming.orderTransfer && typeof incoming.orderTransfer === 'object'
          ? (incoming.orderTransfer as Record<string, unknown>)
          : null;
      const withoutOffer = (snapshot: Record<string, unknown>) => {
        const rest = { ...snapshot };
        delete rest.orderTransfer;
        return rest;
      };
      if (
        sameLabel &&
        canonicalJson(withoutOffer(incoming)) ===
          canonicalJson(withoutOffer(stored)) &&
        (incoming.orderTransfer == null ||
          (nextOffer !== null &&
            Boolean(nextOffer.declinedAt) &&
            sameId(nextOffer.toUserId) &&
            String(nextOffer.fromUserId ?? '') ===
              String(offer.fromUserId ?? '') &&
            String(nextOffer.at ?? '') === String(offer.at ?? '')))
      ) {
        return;
      }
    }

    // (b) A waiter taking a customer's order nobody has accepted: accepting
    // IS taking it, so it is parked under the one who accepted.
    const GUEST_ACCEPT_KEYS = new Set([
      'consumerAcceptedAt',
      'waiterUserId',
      'waiterName',
    ]);
    if (
      this.isPendingConsumerOrder(cart) &&
      meta &&
      Boolean(meta.consumerAcceptedAt) &&
      Object.keys(meta).every((key) => GUEST_ACCEPT_KEYS.has(key)) &&
      (meta.waiterUserId === undefined || sameId(meta.waiterUserId)) &&
      incoming !== null &&
      sameId(incoming.waiterUserId)
    ) {
      return;
    }

    throw new ForbiddenException(
      `Order #${cart.id} is not yours to change. You can change your own orders, take over one handed to you, or accept a customer's new order — ask a manager or the counter for anything else.`,
    );
  }

  /** A customer's storefront order that no one at the branch has accepted. */
  private isPendingConsumerOrder(cart: PosSuspendedCart): boolean {
    const metadata = (cart.metadata ?? {}) as Record<string, unknown>;
    return metadata.consumerSource === 'SUUQS' && !metadata.consumerAcceptedAt;
  }

  async updateSuspendedCart(
    id: number,
    dto: UpdatePosSuspendedCartDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[] | null;
      /**
       * Set when the caller holds none of the permissions that write anyone's
       * cart (see PATCH_ANY_CART_PERMISSIONS in the controller): their PATCH
       * is judged by assertLimitedWriterMayPatch. Absent or null: unrestricted.
       */
      limitedWriter?: { mayMarkKitchen: boolean } | null;
    } = {},
  ): Promise<PosSuspendedCartResponseDto> {
    // Resolved before the row lock, on the pooled connection, for the same
    // reason every read inside the transaction uses its own: holding one
    // connection while waiting for another is how the pool drains.
    const limitedWriterName = actor.limitedWriter
      ? await this.resolveActorName(actor, dto.branchId)
      : null;
    // Read, decide and write under a row lock. Two tills writing one folio
    // used to read the same row, each lay its own copy over it, and the second
    // save silently erased the first — a fee payment and a marks save, or two
    // desks taking a payment each. The lock makes the second writer wait for
    // the first and then see its result; `expectedUpdatedAt` lets it notice.
    //
    // Every read inside runs on the transaction's own connection (see the
    // `em` passed to the helpers below): a transaction that holds one pooled
    // connection while waiting for a second is how a busy worker drains its
    // ten-connection pool.
    const saved = await this.suspendedCartsRepository.manager.transaction(
      async (em) => {
        const repo = em.getRepository(PosSuspendedCart);
        const cart = await repo.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!cart) {
          throw new NotFoundException(`Suspended cart ${id} not found`);
        }
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

        // The optional precondition: "write this only over the row I read".
        // Compared at millisecond grain, which is what the caller was handed.
        // Absent, the write is unconditional, exactly as before — every till
        // and board that never sends it behaves as it always did.
        if (dto.expectedUpdatedAt) {
          const expected = Date.parse(dto.expectedUpdatedAt);
          const current =
            cart.updatedAt instanceof Date
              ? cart.updatedAt.getTime()
              : Date.parse(String(cart.updatedAt ?? ''));
          if (expected !== current) {
            throw new ConflictException({
              code: 'FOLIO_CHANGED',
              message:
                'This record changed since it was read — it has been reloaded; check it and save again.',
              details: { current: this.toSuspendedCartResponse(cart) },
            });
          }
        }

        if (actor.limitedWriter) {
          this.assertLimitedWriterMayPatch(
            cart,
            dto,
            actor,
            actor.limitedWriter,
            limitedWriterName,
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
          let incoming = dto.cartSnapshot as Record<string, unknown>;

          // A row that was NOT a pupil and now is one is an enrolment, the
          // same as a create: park an ordinary basket, then PATCH a name and
          // class onto it, and a new pupil was on the roll with no right asked.
          if (
            !isSchoolPupilFolio(cart) &&
            isSchoolPupilFolio({ cartSnapshot: incoming }) &&
            !(await this.mayCreatePupilRecord(cart.branchId, actor))
          ) {
            throw new ForbiddenException({
              code: PUPIL_RECORD_REFUSED_CODE,
              message: PUPIL_CREATE_REFUSED_MESSAGE,
            });
          }

          if (isSchoolPupilFolio(cart)) {
            // A stored pupil turned into something that is not a pupil — moved
            // to another format, or its name blanked — is the first half of a
            // withdrawal: the very next discard of the row no longer looks like
            // a pupil's, so it would pass without WITHDRAW_STUDENT and without
            // the owner's email. The right is asked for HERE, on the change,
            // exactly as the discard asks for it.
            if (!isSchoolPupilFolio({ cartSnapshot: incoming })) {
              await this.assertCanWithdrawStudent(cart, actor, em);
            }

            // Marks are not this route's to write. Every till save carries a
            // copy of the pupil's marks as they were when the till last read
            // the list — up to minutes earlier on the list poll — so a fee
            // payment laid that copy back over the row and erased whatever a
            // teacher had saved in between. The stored record is kept, whatever
            // the caller sent (stored absent ⇒ absent); marks are written only
            // through PATCH school/marks and school/marks/reports, which lock
            // this row and merge into it.
            const stored = (cart.cartSnapshot ?? {}) as Record<string, unknown>;
            const rest = { ...incoming };
            delete rest.schoolAcademicRecord;
            incoming = Object.prototype.hasOwnProperty.call(
              stored,
              'schoolAcademicRecord',
            )
              ? { ...rest, schoolAcademicRecord: stored.schoolAcademicRecord }
              : rest;

            // The pupil's own record is the office's (owner 2026-10-18: "do
            // not allow cashiers to edit the whole student list, except login
            // only"). A fee and a rename travel in this one PATCH, so what
            // moved decides — see school-pupil-record.policy. A plain fee save
            // moves nothing and costs no lookup. Beyond the actor's scope (the
            // logins desk may write the guardian's phone and nothing else), a
            // CHANGE is refused and a field filled or left out keeps its stored
            // value. The office's snapshot is written as sent.
            if (isSchoolPupilFolio({ cartSnapshot: incoming })) {
              const delta = pupilRecordDelta(stored, incoming);
              const touched =
                delta.changed.length +
                delta.filled.length +
                delta.dropped.length;
              if (touched) {
                const beyond = deltaBeyondScope(
                  delta,
                  await this.pupilEditScopeOf(cart, actor, em),
                );
                if (beyond.changed.length) {
                  throw new ForbiddenException({
                    code: PUPIL_RECORD_REFUSED_CODE,
                    message: pupilRecordRefusal(beyond.changed),
                    details: { fields: beyond.changed },
                  });
                }
                incoming = keepStoredPupilRecord(stored, incoming, [
                  ...beyond.filled,
                  ...beyond.dropped,
                ]);
              }
            }
          }

          // The same three rules as a create, with this row excused from the
          // collision check: a settle re-saves the pupil's own snapshot, and a
          // pupil cannot collide with themselves.
          await this.assertSchoolRollAccepts(
            cart.branchId,
            incoming,
            Number(cart.id),
            em,
          );
          cart.cartSnapshot = incoming;
        }
        if (typeof dto.label === 'string' && dto.label.trim()) {
          cart.label = dto.label.trim();
        }
        if (
          typeof dto.itemCount === 'number' &&
          Number.isFinite(dto.itemCount)
        ) {
          cart.itemCount = dto.itemCount;
        }
        if (typeof dto.total === 'number' && Number.isFinite(dto.total)) {
          cart.total = dto.total;
        }

        return repo.save(cart);
      },
    );

    return this.toSuspendedCartResponse(saved);
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

  private async assertBranch(branchId: number): Promise<Branch> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${branchId} not found`);
    }
    return branch;
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

  /** May this actor enrol: the pupil-record editors plus the roster importer. */
  private async mayCreatePupilRecord(
    branchId: number,
    actor: { id?: number | null; roles?: string[] | null },
  ): Promise<boolean> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId },
      select: { id: true, ownerId: true, retailTenantId: true },
    });
    const assignment =
      actor.id != null
        ? await this.staffAssignmentsRepository.findOne({
            where: { branchId, userId: actor.id },
          })
        : null;
    return canCreatePupilRecord({
      actorId: actor.id ?? null,
      ownerId: branch?.ownerId ?? null,
      tenantOwnerId: await tenantOwnerOf(
        this.branchesRepository.manager,
        branch?.retailTenantId,
      ),
      roles: actor.roles ?? [],
      assignment,
    });
  }

  /** ALL for the office, a manager, the owner or a platform admin; GUARDIAN_PHONE for the logins desk — read off the roster. */
  private async pupilEditScopeOf(
    cart: PosSuspendedCart,
    actor: { id?: number | null; roles?: string[] | null },
    em?: EntityManager,
  ) {
    const branches = em ? em.getRepository(Branch) : this.branchesRepository;
    const assignments = em
      ? em.getRepository(BranchStaffAssignment)
      : this.staffAssignmentsRepository;
    const branch = await branches.findOne({
      where: { id: cart.branchId },
      select: { id: true, ownerId: true, retailTenantId: true },
    });
    const assignment =
      actor.id != null
        ? await assignments.findOne({
            where: { branchId: cart.branchId, userId: actor.id },
          })
        : null;
    return pupilEditScope({
      actorId: actor.id ?? null,
      ownerId: branch?.ownerId ?? null,
      tenantOwnerId: await tenantOwnerOf(
        em ?? this.branchesRepository.manager,
        branch?.retailTenantId,
      ),
      roles: actor.roles ?? [],
      assignment,
    });
  }

  private async assertCanWithdrawStudent(
    cart: PosSuspendedCart,
    actor: { id?: number | null; email?: string | null },
    em?: EntityManager,
  ): Promise<void> {
    const branches = em ? em.getRepository(Branch) : this.branchesRepository;
    const assignments = em
      ? em.getRepository(BranchStaffAssignment)
      : this.staffAssignmentsRepository;
    const branch = await branches.findOne({
      where: { id: cart.branchId },
      select: { id: true, ownerId: true },
    });
    const assignment =
      actor.id != null
        ? await assignments.findOne({
            where: { branchId: cart.branchId, userId: actor.id },
          })
        : null;
    if (
      !canWithdrawStudent({
        actorId: actor.id ?? null,
        ownerId: branch?.ownerId ?? null,
        assignment,
      })
    ) {
      throw new ForbiddenException(SCHOOL_WITHDRAWAL_REFUSED_MESSAGE);
    }
  }

  /**
   * The three rules a SCHOOL folio must satisfy before it joins the roll —
   * see `school-roll.policy.ts` for why they live server-side at all.
   *
   *   1. An empty school basket (no pupil, no lines, not an application) is
   *      refused; there is nothing in it worth a row.
   *   2. A pupil must be in a class.
   *   3. A pupil's admission number must not already be on this branch's LIVE
   *      roll — SUSPENDED, SCHOOL, not voided — on any row but `exceptId`.
   *      The refusal names the row it collides with, so the office can open
   *      the child that is already there instead of retyping them.
   *
   * Only ever reaches the database for a pupil folio carrying an admission
   * number, so every other format pays nothing for it.
   */
  private async assertSchoolRollAccepts(
    branchId: number,
    snapshot: Record<string, unknown>,
    exceptId: number | null,
    em?: EntityManager,
  ): Promise<void> {
    const cart = { cartSnapshot: snapshot };
    if (isEmptySchoolBasket(cart)) {
      throw new BadRequestException(
        'Nothing to park: a school folio needs a pupil or at least one line.',
      );
    }
    const shape = schoolPupilShapeProblem(cart);
    if (shape) throw new BadRequestException(shape);

    const admissionNo = schoolAdmissionNoOf(cart);
    if (!admissionNo) return;

    const carts = em
      ? em.getRepository(PosSuspendedCart)
      : this.suspendedCartsRepository;
    const qb = carts
      .createQueryBuilder('c')
      .select(['c.id', 'c.cartSnapshot'])
      .where('c."branchId" = :branchId', { branchId })
      .andWhere('c.status = :status', {
        status: PosSuspendedCartStatus.SUSPENDED,
      })
      .andWhere(
        `upper(coalesce(c."cartSnapshot" ->> 'serviceFormat', '')) = 'SCHOOL'`,
      )
      .andWhere(`coalesce(c."cartSnapshot" ->> 'paid', '') <> 'voided'`)
      .andWhere(
        `lower(btrim(coalesce(c."cartSnapshot" ->> 'schoolAdmissionNo', ''))) = :admissionNo`,
        { admissionNo },
      );
    if (exceptId != null) {
      qb.andWhere('c.id <> :exceptId', { exceptId });
    }
    const clash = await qb.getOne();
    if (!clash) return;

    const theirs = (clash.cartSnapshot ?? {}) as Record<string, unknown>;
    const name = String(theirs.hotelGuestName ?? '').trim() || 'a pupil';
    const cls = String(theirs.hotelRoomNumber ?? '').trim();
    throw new ConflictException(
      `Admission no. ${String(snapshot.schoolAdmissionNo).trim()} is already on the roll — ${name}${cls ? ` in ${cls}` : ''} (record #${Number(clash.id)}). Open that record instead of enrolling them again.`,
    );
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

/**
 * JSON with object keys sorted at every depth, so two snapshots compare by
 * content: a row read back from jsonb does not keep the key order it was
 * written in.
 */
function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      return Object.keys(v)
        .sort()
        .reduce<Record<string, unknown>>((out, key) => {
          out[key] = sort((v as Record<string, unknown>)[key]);
          return out;
        }, {});
    }
    return v;
  };
  return JSON.stringify(sort(value)) ?? 'undefined';
}
