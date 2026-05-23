import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Product } from '../products/entities/product.entity';
import {
  HotelRoom,
  HotelRoomStatus,
} from '../hospitality/entities/hotel-room.entity';
import { HotelRatePlan } from '../hospitality/entities/hotel-rate-plan.entity';
import {
  HotelReservation,
  HotelReservationStatus,
} from '../hospitality/entities/hotel-reservation.entity';
import {
  StorefrontListQueryDto,
  StorefrontProductsQueryDto,
  StorefrontHotelRoomsQueryDto,
} from './dto/storefront-query.dto';

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
  ) {}

  // ── Store listing ─────────────────────────────────────────────────────────

  async listStores(query: StorefrontListQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isConsumerVisible: true };
    if (query.serviceFormat) where.serviceFormat = query.serviceFormat;

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
      ? await this.branchRepo.find({ where: branchIds.map((id) => ({ id })) })
      : [];
    const branchById = new Map(branches.map((b) => [b.id, b]));

    // Filter by city if provided (branch-side field)
    const filtered = query.city
      ? stores.filter((s) => {
          const b = s.branchId != null ? branchById.get(s.branchId) : null;
          return (
            b?.city != null &&
            b.city.toLowerCase().includes(query.city.toLowerCase())
          );
        })
      : stores;

    return {
      items: filtered.map((s) =>
        this.toStoreSummary(
          s,
          s.branchId != null ? branchById.get(s.branchId) : null,
        ),
      ),
      total: query.city ? filtered.length : total,
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
    return {
      storeId: store.id,
      storeName: store.storeName,
      serviceFormat: store.serviceFormat ?? null,
      coverImageUrl: store.coverImageUrl ?? null,
      city: branch?.city ?? null,
      country: branch?.country ?? null,
      address: branch?.address ?? null,
      latitude: branch?.latitude ?? null,
      longitude: branch?.longitude ?? null,
    };
  }

  private toStoreDetail(store: VendorStore, branch: Branch | null | undefined) {
    return {
      storeId: store.id,
      storeName: store.storeName,
      serviceFormat: store.serviceFormat ?? null,
      coverImageUrl: store.coverImageUrl ?? null,
      operatingHours: store.operatingHours ?? null,
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
}
