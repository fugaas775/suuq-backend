import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PropertyUnit,
  PropertyUnitStatus,
  PropertyUnitType,
} from './entities/property-unit.entity';
import { PropertyRatePlan } from './entities/property-rate-plan.entity';
import {
  PropertyReservation,
  PropertyReservationStatus,
} from './entities/property-reservation.entity';
import {
  CreatePropertyRatePlanDto,
  CreatePropertyReservationDto,
  CreatePropertyUnitDto,
  ListPropertyRatePlansQueryDto,
  ListPropertyReservationsQueryDto,
  ListPropertyUnitsQueryDto,
  UpdatePropertyReservationDto,
  UpdatePropertyUnitDto,
} from './dto/property-inventory.dto';

type ActorSummary = { id?: number | null; email?: string | null };

@Injectable()
export class PropertyRentalInventoryService {
  constructor(
    @InjectRepository(PropertyUnit)
    private readonly unitRepo: Repository<PropertyUnit>,
    @InjectRepository(PropertyRatePlan)
    private readonly ratePlanRepo: Repository<PropertyRatePlan>,
    @InjectRepository(PropertyReservation)
    private readonly reservationRepo: Repository<PropertyReservation>,
  ) {}

  // ── Units ─────────────────────────────────────────────────────────────────

  private toUnitResponse(unit: PropertyUnit) {
    return {
      id: unit.id,
      branchId: unit.branchId,
      propertyCode: unit.propertyCode,
      name: unit.name,
      unitType: unit.unitType,
      address: unit.address ?? null,
      capacity: unit.capacity ?? null,
      areaSqm: unit.areaSqm !== null ? Number(unit.areaSqm) : null,
      status: unit.status,
      metadata: unit.metadata ?? null,
      createdAt: unit.createdAt.toISOString(),
      updatedAt: unit.updatedAt.toISOString(),
    };
  }

  async listUnits(query: ListPropertyUnitsQueryDto) {
    const where: Partial<PropertyUnit> = { branchId: query.branchId };
    if (query.status) {
      const normalized = String(query.status).trim().toUpperCase();
      if (
        Object.values(PropertyUnitStatus).includes(
          normalized as PropertyUnitStatus,
        )
      ) {
        where.status = normalized as PropertyUnitStatus;
      }
    }
    const units = await this.unitRepo.find({
      where,
      order: { propertyCode: 'ASC' },
      take: 500,
    });
    return { items: units.map((u) => this.toUnitResponse(u)) };
  }

  async createUnit(dto: CreatePropertyUnitDto) {
    const propertyCode = String(dto.propertyCode || '').trim();
    const existing = await this.unitRepo.findOne({
      where: { branchId: dto.branchId, propertyCode },
    });
    if (existing) {
      throw new ConflictException(
        `Property code "${propertyCode}" already exists for this branch.`,
      );
    }
    const unitType = String(dto.unitType || '')
      .trim()
      .toUpperCase();
    const status = String(dto.status || '')
      .trim()
      .toUpperCase();
    const unit = this.unitRepo.create({
      branchId: dto.branchId,
      propertyCode,
      name: String(dto.name || '').trim(),
      unitType: Object.values(PropertyUnitType).includes(
        unitType as PropertyUnitType,
      )
        ? (unitType as PropertyUnitType)
        : PropertyUnitType.OTHER,
      address: dto.address ? String(dto.address).trim() : null,
      capacity: dto.capacity ?? null,
      areaSqm:
        dto.areaSqm !== undefined && dto.areaSqm !== null
          ? Number(dto.areaSqm)
          : null,
      status:
        status === PropertyUnitStatus.INACTIVE
          ? PropertyUnitStatus.INACTIVE
          : PropertyUnitStatus.ACTIVE,
    });
    const saved = await this.unitRepo.save(unit);
    return this.toUnitResponse(saved);
  }

  async updateUnit(id: number, dto: UpdatePropertyUnitDto) {
    const unit = await this.unitRepo.findOne({ where: { id } });
    if (!unit) {
      throw new NotFoundException(`Property unit ${id} not found.`);
    }
    if (dto.name !== undefined) unit.name = String(dto.name).trim();
    if (dto.unitType !== undefined) {
      const unitType = String(dto.unitType).trim().toUpperCase();
      if (
        Object.values(PropertyUnitType).includes(unitType as PropertyUnitType)
      ) {
        unit.unitType = unitType as PropertyUnitType;
      }
    }
    if (dto.address !== undefined)
      unit.address = dto.address ? String(dto.address).trim() : null;
    if (dto.capacity !== undefined) unit.capacity = dto.capacity ?? null;
    if (dto.areaSqm !== undefined)
      unit.areaSqm = dto.areaSqm !== null ? Number(dto.areaSqm) : null;
    if (dto.status !== undefined) {
      const status = String(dto.status).trim().toUpperCase();
      if (
        Object.values(PropertyUnitStatus).includes(status as PropertyUnitStatus)
      ) {
        unit.status = status as PropertyUnitStatus;
      }
    }
    const saved = await this.unitRepo.save(unit);
    return this.toUnitResponse(saved);
  }

  // ── Rate plans ──────────────────────────────────────────────────────────────

  private toRatePlanResponse(plan: PropertyRatePlan) {
    return {
      id: plan.id,
      branchId: plan.branchId,
      name: plan.name,
      propertyId: plan.propertyId ?? null,
      monthlyRate: plan.monthlyRate !== null ? Number(plan.monthlyRate) : null,
      weeklyRate: plan.weeklyRate !== null ? Number(plan.weeklyRate) : null,
      nightlyRate: plan.nightlyRate !== null ? Number(plan.nightlyRate) : null,
      depositAmount:
        plan.depositAmount !== null ? Number(plan.depositAmount) : null,
      lateFeeAmount:
        plan.lateFeeAmount !== null ? Number(plan.lateFeeAmount) : null,
      currency: plan.currency,
      taxPercent: plan.taxPercent !== null ? Number(plan.taxPercent) : null,
      isActive: plan.isActive === true,
      validFrom: plan.validFrom ?? null,
      validTo: plan.validTo ?? null,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    };
  }

  async listRatePlans(query: ListPropertyRatePlansQueryDto) {
    const plans = await this.ratePlanRepo.find({
      where: { branchId: query.branchId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return { items: plans.map((p) => this.toRatePlanResponse(p)) };
  }

  async createRatePlan(dto: CreatePropertyRatePlanDto) {
    const plan = this.ratePlanRepo.create({
      branchId: dto.branchId,
      name: String(dto.name || '').trim(),
      propertyId: dto.propertyId ?? null,
      monthlyRate:
        dto.monthlyRate !== undefined && dto.monthlyRate !== null
          ? Number(dto.monthlyRate)
          : null,
      weeklyRate:
        dto.weeklyRate !== undefined && dto.weeklyRate !== null
          ? Number(dto.weeklyRate)
          : null,
      nightlyRate:
        dto.nightlyRate !== undefined && dto.nightlyRate !== null
          ? Number(dto.nightlyRate)
          : null,
      depositAmount:
        dto.depositAmount !== undefined && dto.depositAmount !== null
          ? Number(dto.depositAmount)
          : null,
      lateFeeAmount:
        dto.lateFeeAmount !== undefined && dto.lateFeeAmount !== null
          ? Number(dto.lateFeeAmount)
          : null,
      currency: dto.currency
        ? String(dto.currency).trim().toUpperCase()
        : 'ETB',
      taxPercent:
        dto.taxPercent !== undefined && dto.taxPercent !== null
          ? Number(dto.taxPercent)
          : null,
      isActive: dto.isActive !== undefined ? dto.isActive === true : true,
      validFrom: dto.validFrom ?? null,
      validTo: dto.validTo ?? null,
    });
    const saved = await this.ratePlanRepo.save(plan);
    return this.toRatePlanResponse(saved);
  }

  // ── Reservations ────────────────────────────────────────────────────────────

  private toReservationResponse(r: PropertyReservation) {
    return {
      id: r.id,
      branchId: r.branchId,
      status: r.status,
      propertyCode: r.propertyCode ?? null,
      renterName: r.renterName,
      renterPhone: r.renterPhone ?? null,
      renterEmail: r.renterEmail ?? null,
      numberOfOccupants: r.numberOfOccupants ?? null,
      leaseStartAt: r.leaseStartAt,
      leaseEndAt: r.leaseEndAt,
      ratePlanId: r.ratePlanId ?? null,
      bookingId: r.bookingId ?? null,
      notes: r.notes ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async listReservations(query: ListPropertyReservationsQueryDto) {
    const where: Partial<PropertyReservation> = { branchId: query.branchId };
    if (query.status) {
      const normalized = String(query.status).trim().toUpperCase();
      if (
        Object.values(PropertyReservationStatus).includes(
          normalized as PropertyReservationStatus,
        )
      ) {
        where.status = normalized as PropertyReservationStatus;
      }
    }
    const reservations = await this.reservationRepo.find({
      where,
      order: { leaseStartAt: 'ASC' },
      take: 200,
    });
    return { items: reservations.map((r) => this.toReservationResponse(r)) };
  }

  async createReservation(
    dto: CreatePropertyReservationDto,
    actor?: ActorSummary,
  ) {
    const reservation = this.reservationRepo.create({
      branchId: dto.branchId,
      status: PropertyReservationStatus.HOLD,
      propertyCode: dto.propertyCode ? String(dto.propertyCode).trim() : null,
      renterName: String(dto.renterName || '').trim(),
      renterPhone: dto.renterPhone ? String(dto.renterPhone).trim() : null,
      renterEmail: dto.renterEmail ? String(dto.renterEmail).trim() : null,
      numberOfOccupants: dto.numberOfOccupants ?? null,
      leaseStartAt: dto.leaseStartAt ?? null,
      leaseEndAt: dto.leaseEndAt ?? null,
      ratePlanId: dto.ratePlanId ?? null,
      notes: dto.notes ? String(dto.notes).trim() : null,
      createdByUserId: actor?.id ?? null,
    });
    const saved = await this.reservationRepo.save(reservation);
    return this.toReservationResponse(saved);
  }

  async updateReservation(id: number, dto: UpdatePropertyReservationDto) {
    const reservation = await this.reservationRepo.findOne({ where: { id } });
    if (!reservation) {
      throw new NotFoundException(`Property reservation ${id} not found.`);
    }
    if (dto.status !== undefined) {
      const status = String(dto.status).trim().toUpperCase();
      if (
        Object.values(PropertyReservationStatus).includes(
          status as PropertyReservationStatus,
        )
      ) {
        reservation.status = status as PropertyReservationStatus;
      }
    }
    if (dto.propertyCode !== undefined)
      reservation.propertyCode = dto.propertyCode
        ? String(dto.propertyCode).trim()
        : null;
    if (dto.renterName !== undefined)
      reservation.renterName = String(dto.renterName).trim();
    if (dto.renterPhone !== undefined)
      reservation.renterPhone = dto.renterPhone
        ? String(dto.renterPhone).trim()
        : null;
    if (dto.renterEmail !== undefined)
      reservation.renterEmail = dto.renterEmail
        ? String(dto.renterEmail).trim()
        : null;
    if (dto.numberOfOccupants !== undefined)
      reservation.numberOfOccupants = dto.numberOfOccupants ?? null;
    if (dto.leaseStartAt !== undefined)
      reservation.leaseStartAt = dto.leaseStartAt ?? null;
    if (dto.leaseEndAt !== undefined)
      reservation.leaseEndAt = dto.leaseEndAt ?? null;
    if (dto.ratePlanId !== undefined)
      reservation.ratePlanId = dto.ratePlanId ?? null;
    if (dto.notes !== undefined)
      reservation.notes = dto.notes ? String(dto.notes).trim() : null;

    const saved = await this.reservationRepo.save(reservation);
    return this.toReservationResponse(saved);
  }
}
