import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HotelFolio, HotelFolioStatus } from './entities/hotel-folio.entity';
import { HotelFolioCharge } from './entities/hotel-folio-charge.entity';
import {
  ListHotelFoliosQueryDto,
  OpenFolioDto,
  PostFolioChargeDto,
  SettleFolioDto,
  TransferFolioRoomDto,
  VoidFolioDto,
} from './dto/hotel-folio.dto';

type ActorSummary = { id?: number | null; email?: string | null };

@Injectable()
export class HotelFolioService {
  constructor(
    @InjectRepository(HotelFolio)
    private readonly folioRepo: Repository<HotelFolio>,
    @InjectRepository(HotelFolioCharge)
    private readonly chargeRepo: Repository<HotelFolioCharge>,
  ) {}

  private toFolioResponse(folio: HotelFolio, charges: HotelFolioCharge[] = []) {
    return {
      id: folio.id,
      branchId: folio.branchId,
      localRef: folio.localRef,
      status: folio.status,
      roomNumber: folio.roomNumber,
      guestName: folio.guestName,
      guestPhone: folio.guestPhone ?? null,
      guestNationality: folio.guestNationality ?? null,
      guestIdType: folio.guestIdType ?? null,
      guestIdNumber: folio.guestIdNumber ?? null,
      rateId: folio.rateId ?? null,
      reservationId: folio.reservationId ?? null,
      checkInAt: folio.checkInAt,
      checkOutAt: folio.checkOutAt,
      currency: folio.currency,
      chargesTotal: Number(folio.chargesTotal) || 0,
      settledCheckoutId: folio.settledCheckoutId,
      paidAmount: folio.paidAmount !== null ? Number(folio.paidAmount) : null,
      voidReason: folio.voidReason,
      transferredToRoom: folio.transferredToRoom,
      createdAt: folio.createdAt.toISOString(),
      updatedAt: folio.updatedAt.toISOString(),
      settledAt: folio.settledAt?.toISOString() ?? null,
      voidedAt: folio.voidedAt?.toISOString() ?? null,
      charges: charges.map((c) => ({
        id: c.id,
        chargeGroupCode: c.chargeGroupCode,
        chargeName: c.chargeName,
        amount: Number(c.amount),
        currency: c.currency,
        quantity: Number(c.quantity) || 1,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  async listFolios(query: ListHotelFoliosQueryDto) {
    const where: Partial<HotelFolio> = { branchId: query.branchId };

    if (query.status) {
      const normalized = String(query.status).trim().toUpperCase();
      if (
        Object.values(HotelFolioStatus).includes(normalized as HotelFolioStatus)
      ) {
        where.status = normalized as HotelFolioStatus;
      }
    }

    const folios = await this.folioRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });

    return {
      items: folios.map((f) => this.toFolioResponse(f)),
    };
  }

  async openFolio(dto: OpenFolioDto, actor?: ActorSummary) {
    const idempotencyKey = String(dto.idempotencyKey || '').trim();

    if (idempotencyKey) {
      const existing = await this.folioRepo.findOne({
        where: { idempotencyKey },
      });
      if (existing) {
        return this.toFolioResponse(existing);
      }
    }

    const key = idempotencyKey || `folio-open-${dto.branchId}-${Date.now()}`;
    const folio = this.folioRepo.create({
      branchId: dto.branchId,
      localRef: dto.localRef ?? null,
      status: HotelFolioStatus.OPEN,
      roomNumber: String(dto.roomNumber || '').trim(),
      guestName: dto.guestName ? String(dto.guestName).trim() : null,
      guestPhone: dto.guestPhone ? String(dto.guestPhone).trim() : null,
      guestNationality: dto.guestNationality
        ? String(dto.guestNationality).trim()
        : null,
      guestIdType: dto.guestIdType ? String(dto.guestIdType).trim() : null,
      guestIdNumber: dto.guestIdNumber
        ? String(dto.guestIdNumber).trim()
        : null,
      rateId: dto.rateId ?? null,
      reservationId: dto.reservationId ?? null,
      checkInAt: dto.checkInAt ?? null,
      checkOutAt: dto.checkOutAt ?? null,
      currency: dto.currency
        ? String(dto.currency).trim().toUpperCase()
        : 'ETB',
      chargesTotal: 0,
      idempotencyKey: key,
      openedByUserId: actor?.id ?? null,
    });

    const saved = await this.folioRepo.save(folio);
    return this.toFolioResponse(saved);
  }

  async postCharge(folioId: number, dto: PostFolioChargeDto) {
    const folio = await this.folioRepo.findOne({ where: { id: folioId } });

    if (!folio) {
      throw new NotFoundException(`Hotel folio ${folioId} not found.`);
    }

    if (folio.status !== HotelFolioStatus.OPEN) {
      throw new BadRequestException(
        `Folio ${folioId} is not open — cannot post charges.`,
      );
    }

    const idempotencyKey = String(dto.idempotencyKey || '').trim() || null;

    if (idempotencyKey) {
      const existing = await this.chargeRepo.findOne({
        where: { folioId, idempotencyKey },
      });
      if (existing) {
        return {
          id: existing.id,
          folioId,
          chargeGroupCode: existing.chargeGroupCode,
          chargeName: existing.chargeName,
          amount: Number(existing.amount),
          currency: existing.currency,
          quantity: Number(existing.quantity) || 1,
          createdAt: existing.createdAt.toISOString(),
        };
      }
    }

    const amount =
      Math.round((Number(dto.amount || 0) + Number.EPSILON) * 100) / 100;
    const quantity = Math.max(1, Math.round(Number(dto.quantity || 1)));

    const charge = this.chargeRepo.create({
      folioId,
      branchId: folio.branchId,
      chargeGroupCode: dto.chargeGroupCode
        ? String(dto.chargeGroupCode).trim()
        : null,
      chargeName: String(dto.chargeName).trim(),
      amount,
      currency: dto.currency
        ? String(dto.currency).trim().toUpperCase()
        : folio.currency,
      quantity,
      idempotencyKey,
    });

    const saved = await this.chargeRepo.save(charge);

    // Update running total on the folio
    await this.folioRepo.increment(
      { id: folioId },
      'chargesTotal',
      amount * quantity,
    );

    return {
      id: saved.id,
      folioId,
      chargeGroupCode: saved.chargeGroupCode,
      chargeName: saved.chargeName,
      amount: Number(saved.amount),
      currency: saved.currency,
      quantity: Number(saved.quantity) || 1,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async settleFolio(folioId: number, dto: SettleFolioDto) {
    const folio = await this.folioRepo.findOne({ where: { id: folioId } });

    if (!folio) {
      throw new NotFoundException(`Hotel folio ${folioId} not found.`);
    }

    if (folio.status === HotelFolioStatus.SETTLED) {
      // Idempotent — return current state
      return this.toFolioResponse(folio);
    }

    if (folio.status !== HotelFolioStatus.OPEN) {
      throw new BadRequestException(
        `Folio ${folioId} cannot be settled from status ${folio.status}.`,
      );
    }

    folio.status = HotelFolioStatus.SETTLED;
    folio.settledCheckoutId = dto.checkoutId ?? null;
    // If multi-payment array is provided, sum it; otherwise fall back to legacy flat field.
    folio.paidAmount =
      dto.payments && dto.payments.length > 0
        ? dto.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
        : dto.paidAmount !== undefined
          ? dto.paidAmount
          : null;
    folio.settledAt = dto.settledAt ? new Date(dto.settledAt) : new Date();

    const saved = await this.folioRepo.save(folio);
    return this.toFolioResponse(saved);
  }

  async voidFolio(folioId: number, dto: VoidFolioDto) {
    const folio = await this.folioRepo.findOne({ where: { id: folioId } });

    if (!folio) {
      throw new NotFoundException(`Hotel folio ${folioId} not found.`);
    }

    if (folio.status === HotelFolioStatus.VOIDED) {
      return this.toFolioResponse(folio);
    }

    if (folio.status === HotelFolioStatus.SETTLED) {
      throw new ConflictException(
        `Folio ${folioId} is already settled and cannot be voided.`,
      );
    }

    folio.status = HotelFolioStatus.VOIDED;
    folio.voidReason = dto.reason ? String(dto.reason).trim() : null;
    folio.voidedAt = new Date();

    const saved = await this.folioRepo.save(folio);
    return this.toFolioResponse(saved);
  }

  async transferFolioRoom(folioId: number, dto: TransferFolioRoomDto) {
    const folio = await this.folioRepo.findOne({ where: { id: folioId } });

    if (!folio) {
      throw new NotFoundException(`Hotel folio ${folioId} not found.`);
    }

    if (folio.status !== HotelFolioStatus.OPEN) {
      throw new BadRequestException(
        `Folio ${folioId} is not open — cannot transfer room.`,
      );
    }

    folio.transferredToRoom = folio.roomNumber;
    folio.roomNumber = String(dto.newRoomNumber).trim();

    if (dto.newGuestName) {
      folio.guestName = String(dto.newGuestName).trim();
    }

    const saved = await this.folioRepo.save(folio);
    return this.toFolioResponse(saved);
  }
}
