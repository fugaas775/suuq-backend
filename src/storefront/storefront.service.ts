import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Product } from '../products/entities/product.entity';
import {
  HotelRoom,
  HotelRoomStatus,
} from '../hospitality/entities/hotel-room.entity';
import { HotelRatePlan } from '../hospitality/entities/hotel-rate-plan.entity';
import {
  HotelFolio,
  HotelFolioStatus,
} from '../hospitality/entities/hotel-folio.entity';
import {
  HotelReservation,
  HotelReservationStatus,
} from '../hospitality/entities/hotel-reservation.entity';
import {
  StorefrontListQueryDto,
  StorefrontProductsQueryDto,
  StorefrontHotelRoomsQueryDto,
} from './dto/storefront-query.dto';
import { resolveBranchPresence } from '../common/operating-hours';

@Injectable()
export class StorefrontService {
  constructor(
    @InjectRepository(VendorStore)
    private readonly vendorStoreRepo: Repository<VendorStore>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(HotelRoom)
    private readonly hotelRoomRepo: Repository<HotelRoom>,
    @InjectRepository(HotelRatePlan)
    private readonly hotelRatePlanRepo: Repository<HotelRatePlan>,
    @InjectRepository(HotelReservation)
    private readonly hotelReservationRepo: Repository<HotelReservation>,
    @InjectRepository(HotelFolio)
    private readonly hotelFolioRepo: Repository<HotelFolio>,
  ) {}

  // ── Store listing ─────────────────────────────────────────────────────────

  async listStores(query: StorefrontListQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    // If city filter is requested, pre-resolve matching branchIds at DB level
    // so pagination is applied to the already-filtered set.
    let branchIdWhitelist: number[] | null = null;
    if (query.city) {
      const cityBranches = await this.branchRepo
        .createQueryBuilder('b')
        .select('b.id')
        .where('b.city ILIKE :city', { city: `%${query.city}%` })
        .getMany();
      branchIdWhitelist = cityBranches.map((b) => b.id);
      if (branchIdWhitelist.length === 0) {
        return { items: [], total: 0, page, limit };
      }
    }

    const where: Record<string, unknown> = { isConsumerVisible: true };
    if (query.serviceFormat) where.serviceFormat = query.serviceFormat;
    if (branchIdWhitelist !== null) where.branchId = In(branchIdWhitelist);

    const [stores, total] = await this.vendorStoreRepo.findAndCount({
      where,
      order: { storeName: 'ASC' },
      skip,
      take: limit,
    });

    // Enrich with branch city/country/address/coordinates
    const branchIds = stores
      .map((s) => s.branchId)
      .filter((id): id is number => id != null);

    const branches = branchIds.length
      ? await this.branchRepo.find({ where: { id: In(branchIds) } })
      : [];
    const branchById = new Map(branches.map((b) => [b.id, b]));

    return {
      items: stores.map((s) =>
        this.toStoreSummary(
          s,
          s.branchId != null ? branchById.get(s.branchId) : null,
        ),
      ),
      total,
      page,
      limit,
    };
  }

  // ── Single store ──────────────────────────────────────────────────────────

  async getStore(storeId: number) {
    const store = await this.vendorStoreRepo.findOne({
      where: { id: storeId, isConsumerVisible: true },
    });
    if (!store) throw new NotFoundException(`Store #${storeId} not found`);

    const branch = store.branchId
      ? await this.branchRepo.findOne({ where: { id: store.branchId } })
      : null;

    return this.toStoreDetail(store, branch);
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async getStoreProducts(storeId: number, query: StorefrontProductsQueryDto) {
    const store = await this.vendorStoreRepo.findOne({
      where: { id: storeId, isConsumerVisible: true },
    });
    if (!store) throw new NotFoundException(`Store #${storeId} not found`);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));

    const qb = this.productRepo
      .createQueryBuilder('p')
      .where('p.vendorStoreId = :storeId', { storeId })
      .andWhere('(p.isDeleted = false OR p.isDeleted IS NULL)')
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search?.trim()) {
      qb.andWhere('p.name ILIKE :search', {
        search: `%${query.search.trim()}%`,
      });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((p) => this.toProductCard(p)),
      total,
      page,
      limit,
    };
  }

  // ── Hotel rooms ───────────────────────────────────────────────────────────

  async getHotelRooms(storeId: number, query: StorefrontHotelRoomsQueryDto) {
    const branchId = await this.resolveBranchId(storeId, 'HOTEL');
    await this.syncRoomsFromCatalog(storeId, branchId);
    const where: Record<string, unknown> = {
      branchId,
      status: HotelRoomStatus.ACTIVE,
    };
    if (query.roomType) where.roomType = query.roomType;

    const rooms = await this.hotelRoomRepo.find({
      where,
      order: { roomNumber: 'ASC' },
    });
    return { items: rooms.map((r) => this.toRoomCard(r)) };
  }

  // ── Rate plans ────────────────────────────────────────────────────────────

  async getHotelRatePlans(storeId: number) {
    const branchId = await this.resolveBranchId(storeId, 'HOTEL');
    await this.syncRoomsFromCatalog(storeId, branchId);
    const plans = await this.hotelRatePlanRepo.find({
      where: { branchId },
      order: { name: 'ASC' },
    });
    return { items: plans.map((p) => this.toRatePlanCard(p)) };
  }

  // ── Availability ──────────────────────────────────────────────────────────

  async getHotelAvailability(
    storeId: number,
    checkInAt: string,
    checkOutAt: string,
    roomType?: string,
  ) {
    if (!checkInAt || !checkOutAt) {
      throw new BadRequestException('checkInAt and checkOutAt are required');
    }
    if (checkInAt >= checkOutAt) {
      throw new BadRequestException('checkInAt must be before checkOutAt');
    }

    const branchId = await this.resolveBranchId(storeId, 'HOTEL');

    // Keep the room registry mirrored from the merchant's room-charge products
    // so availability reflects their live catalog without manual re-entry.
    await this.syncRoomsFromCatalog(storeId, branchId);

    // Active rooms (optionally filtered by roomType)
    const roomWhere: Record<string, unknown> = {
      branchId,
      status: HotelRoomStatus.ACTIVE,
    };
    if (roomType) roomWhere.roomType = roomType;
    const allRooms = await this.hotelRoomRepo.find({ where: roomWhere });

    // Reservations that overlap the requested window and are not cancelled
    const occupied = await this.hotelReservationRepo
      .createQueryBuilder('r')
      .where('r."branchId" = :branchId', { branchId })
      .andWhere('r."status" NOT IN (:...excluded)', {
        excluded: [
          HotelReservationStatus.CANCELLED,
          HotelReservationStatus.NO_SHOW,
          HotelReservationStatus.CHECKED_OUT,
        ],
      })
      .andWhere('r."checkInAt" < :checkOut', { checkOut: checkOutAt })
      .andWhere('r."checkOutAt" > :checkIn', { checkIn: checkInAt })
      .getMany();

    const occupiedRoomNumbers = new Set(
      occupied.map((r) => r.roomNumber).filter(Boolean),
    );

    // Reservations are only half the truth. A walk-in checked in at the front
    // desk has an open folio and no reservation at all, so a room that is
    // physically occupied still read as bookable here — and the app would sell
    // it twice. Net out open folios too.
    //
    // A folio with no dates is an in-house stay of unknown length: treat it as
    // occupying the room for any window, since the desk has not said when it
    // ends.
    const openFolios = await this.hotelFolioRepo
      .createQueryBuilder('f')
      .where('f."branchId" = :branchId', { branchId })
      .andWhere('f."status" = :status', { status: HotelFolioStatus.OPEN })
      .andWhere('(f."checkInAt" IS NULL OR f."checkInAt" < :checkOut)', {
        checkOut: checkOutAt,
      })
      .andWhere('(f."checkOutAt" IS NULL OR f."checkOutAt" > :checkIn)', {
        checkIn: checkInAt,
      })
      .getMany();

    for (const folio of openFolios) {
      if (folio.roomNumber) occupiedRoomNumbers.add(folio.roomNumber);
    }

    const availableRooms = allRooms.filter(
      (r) => !occupiedRoomNumbers.has(r.roomNumber),
    );

    // Aggregate by roomType
    const byType = new Map<
      string,
      {
        roomType: string;
        availableCount: number;
        maxOccupancy: number;
        description: string | null;
      }
    >();
    for (const r of availableRooms) {
      const key = r.roomType ?? 'STANDARD';
      const existing = byType.get(key);
      if (existing) {
        existing.availableCount++;
      } else {
        byType.set(key, {
          roomType: key,
          availableCount: 1,
          maxOccupancy: r.maxOccupancy ?? 2,
          description: r.description ?? null,
        });
      }
    }

    // Attach rate plans per roomType
    const plans = await this.hotelRatePlanRepo.find({ where: { branchId } });

    return {
      storeId,
      branchId,
      checkInAt,
      checkOutAt,
      roomTypes: Array.from(byType.values()).map((rt) => ({
        ...rt,
        ratePlans: plans
          .filter((p) => p.roomType === null || p.roomType === rt.roomType)
          .map((p) => this.toRatePlanCard(p)),
      })),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async resolveBranchId(
    storeId: number,
    requiredServiceFormat: string,
  ): Promise<number> {
    const store = await this.vendorStoreRepo.findOne({
      where: { id: storeId, isConsumerVisible: true },
    });
    if (!store) throw new NotFoundException(`Store #${storeId} not found`);
    if (
      requiredServiceFormat &&
      store.serviceFormat !== requiredServiceFormat
    ) {
      throw new BadRequestException(
        `Store #${storeId} is not a ${requiredServiceFormat} store`,
      );
    }
    if (!store.branchId) {
      throw new NotFoundException(`Store #${storeId} has no linked branch`);
    }
    return store.branchId;
  }

  private toStoreSummary(
    store: VendorStore,
    branch: Branch | null | undefined,
  ) {
    // Decided here, not on the device: a shopper's phone clock and timezone are
    // not the shop's. `isOpenNow: null` means no published hours — unknown, not
    // closed.
    const presence = resolveBranchPresence(store.operatingHours ?? null);
    return {
      storeId: store.id,
      branchId: store.branchId ?? null,
      storeName: store.storeName,
      serviceFormat: store.serviceFormat ?? null,
      coverImageUrl: store.coverImageUrl ?? null,
      isOpenNow: presence.isOpenNow,
      nextOpenAt: presence.nextOpenAt,
      city: branch?.city ?? null,
      country: branch?.country ?? null,
      address: branch?.address ?? null,
      latitude: branch?.latitude ?? null,
      longitude: branch?.longitude ?? null,
    };
  }

  private toStoreDetail(store: VendorStore, branch: Branch | null | undefined) {
    const presence = resolveBranchPresence(store.operatingHours ?? null);
    return {
      storeId: store.id,
      branchId: store.branchId ?? null,
      storeName: store.storeName,
      serviceFormat: store.serviceFormat ?? null,
      coverImageUrl: store.coverImageUrl ?? null,
      operatingHours: store.operatingHours ?? null,
      isOpenNow: presence.isOpenNow,
      nextOpenAt: presence.nextOpenAt,
      city: branch?.city ?? null,
      country: branch?.country ?? null,
      address: branch?.address ?? null,
      phone: branch?.phone ?? null,
      latitude: branch?.latitude ?? null,
      longitude: branch?.longitude ?? null,
    };
  }

  private toProductCard(p: Product) {
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      imageUrl: p.imageUrl ?? null,
      currency: p.currency ?? null,
    };
  }

  private toRoomCard(r: HotelRoom) {
    return {
      id: r.id,
      roomNumber: r.roomNumber,
      roomType: r.roomType,
      floor: r.floor,
      maxOccupancy: r.maxOccupancy,
      description: r.description,
      status: r.status,
    };
  }

  private toRatePlanCard(p: HotelRatePlan) {
    return {
      id: p.id,
      name: p.name,
      roomType: p.roomType,
      weekdayRate: p.weekdayRate,
      weekendRate: p.weekendRate ?? p.weekdayRate,
      currency: p.currency,
    };
  }

  private normalizeRoomType(name: string | null | undefined): string {
    // Drop a trailing duration/unit phrase merchants append to room-charge
    // product names, e.g. "Standard Room — 1 Night", "Deluxe Suite - 2 nights",
    // "Room / night", so the derived type matches the registry convention
    // (e.g. STANDARD_ROOM) instead of "STANDARD ROOM — 1 NIGHT".
    const stripped = String(name ?? '')
      .replace(/\s*[—–-]\s*\d*\s*nights?\b.*$/i, '')
      .replace(/\s*\/\s*night\b.*$/i, '')
      .replace(/\s*per\s+night\b.*$/i, '');
    const t = stripped
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64);
    return t || 'STANDARD';
  }

  // Rooms the sync created carry this marker in metadata.source, so the sync only
  // ever manages its own rows and never touches manually-configured/seeded rooms.
  private static readonly ROOM_SYNC_SOURCE = 'CATALOG_SYNC';

  /**
   * Mirror a HOTEL branch's room-charge products into the pos_hotel_rooms
   * registry (+ a rate plan per room type when none exists yet), so consumer
   * availability works without merchants double-entering rooms. Rooms stay
   * "service-format products": each room-charge product (one carrying an
   * `attributes.hotelRooms` CSV of room numbers) maps to a room type — its
   * (duration-stripped) name → roomType, its price → nightly rate, each CSV
   * entry → a bookable room.
   *
   * NON-DESTRUCTIVE by design (verified against a live hotel whose registry is
   * curated with intentional rates ≠ the product display price):
   *   • Rooms: inserts missing rooms it owns; deactivates only its own rooms when
   *     they leave the catalog. Manually-created/seeded rooms are never modified.
   *   • Rate plans: creates a plan for a room type only when none exists; never
   *     overwrites an existing rate (the merchant's plan is the booking price).
   * Idempotent and never throws — a sync failure leaves the registry untouched.
   */
  private async syncRoomsFromCatalog(
    storeId: number,
    branchId: number,
  ): Promise<void> {
    try {
      // HOTEL room products live on the branch's own vendor store
      // (product.vendorStoreId === storeId), same source the storefront catalog uses.
      const products = await this.productRepo
        .createQueryBuilder('p')
        .where('p.vendorStoreId = :storeId', { storeId })
        .andWhere('(p.isDeleted = false OR p.isDeleted IS NULL)')
        .getMany();

      const desiredRooms = new Map<string, string>(); // roomNumber → roomType
      const rateByType = new Map<
        string,
        { rate: number; currency: string; name: string }
      >();

      for (const p of products) {
        const attrs =
          p.attributes && typeof p.attributes === 'object' ? p.attributes : {};
        const csv = String(attrs.hotelRooms ?? '').trim();
        if (!csv) continue;
        const roomType = this.normalizeRoomType(p.name);
        const rate = Number(p.price) > 0 ? Number(p.price) : 0;
        const currency = String(p.currency ?? 'ETB').toUpperCase();
        if (!rateByType.has(roomType)) {
          rateByType.set(roomType, {
            rate,
            currency,
            name: String(p.name ?? roomType).trim() || roomType,
          });
        }
        for (const raw of csv.split(',')) {
          const roomNumber = raw.trim().slice(0, 64);
          if (roomNumber) desiredRooms.set(roomNumber, roomType);
        }
      }

      // ── Rooms: additive + provenance-scoped ───────────────────────────────
      const existingRooms = await this.hotelRoomRepo.find({
        where: { branchId },
      });
      const existingByNumber = new Map(
        existingRooms.map((r) => [r.roomNumber, r]),
      );
      const isSyncOwned = (r: HotelRoom) =>
        r.metadata?.source === StorefrontService.ROOM_SYNC_SOURCE;
      const roomsToSave: HotelRoom[] = [];

      for (const [roomNumber, roomType] of desiredRooms) {
        const existing = existingByNumber.get(roomNumber);
        if (!existing) {
          // Insert a new sync-owned room.
          roomsToSave.push(
            this.hotelRoomRepo.create({
              branchId,
              roomNumber,
              roomType,
              maxOccupancy: 2,
              status: HotelRoomStatus.ACTIVE,
              metadata: { source: StorefrontService.ROOM_SYNC_SOURCE },
            }),
          );
        } else if (isSyncOwned(existing)) {
          // Keep our own rooms aligned with the catalog; leave manual rooms alone.
          if (
            existing.roomType !== roomType ||
            existing.status !== HotelRoomStatus.ACTIVE
          ) {
            existing.roomType = roomType;
            existing.status = HotelRoomStatus.ACTIVE;
            roomsToSave.push(existing);
          }
        }
        // existing && manual → respect it, never modify.
      }
      // Deactivate ONLY our own rooms that left the catalog (preserve manual rooms
      // and the row itself so folio/reservation history survives).
      for (const r of existingRooms) {
        if (
          isSyncOwned(r) &&
          !desiredRooms.has(r.roomNumber) &&
          r.status !== HotelRoomStatus.INACTIVE
        ) {
          r.status = HotelRoomStatus.INACTIVE;
          roomsToSave.push(r);
        }
      }
      if (roomsToSave.length) await this.hotelRoomRepo.save(roomsToSave);

      // ── Rate plans: create-if-missing only, never overwrite ───────────────
      // A merchant's existing rate plan is the authoritative booking price (it may
      // intentionally differ from the product's POS/display price), so we only seed
      // a plan for a room type that has none yet.
      const existingPlans = await this.hotelRatePlanRepo.find({
        where: { branchId },
      });
      const planTypes = new Set(
        existingPlans.map((p) => String(p.roomType ?? '').toUpperCase()),
      );
      const plansToSave: HotelRatePlan[] = [];

      for (const [roomType, info] of rateByType) {
        if (info.rate <= 0 || planTypes.has(roomType)) continue;
        plansToSave.push(
          this.hotelRatePlanRepo.create({
            branchId,
            name: info.name,
            roomType,
            weekdayRate: info.rate,
            weekendRate: null,
            currency: info.currency,
            isActive: true,
          }),
        );
      }
      if (plansToSave.length) await this.hotelRatePlanRepo.save(plansToSave);
    } catch {
      // Never let a registry sync failure break a consumer read.
    }
  }
}
